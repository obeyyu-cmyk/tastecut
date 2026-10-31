// 취향컷 계산 엔진
// 시험 스크립트(tools/04_experiment.js)와 앱(app.js)이 똑같은 이 코드를 쓴다.
// 방법: 협업 필터링 — 나와 취향 비슷한 사람(취향 쌍둥이)을 찾아 그 사람들의 반응으로 예측한다.
//  - '취향이 비슷하다' = 같은 영화에서 '남들 평균과 다르게 반응한 방향'이 같다
//    (모두가 좋아하는 영화를 둘 다 좋아한 것보다, 평이 갈리는 영화에서 같은 편이었던 게 더 중요)
//  - 예측 = 전체 관객 비율 + 내 후한 정도 + 취향 쌍둥이들이 평균과 다르게 반응한 정도
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TasteEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 시험(검증용 사람 500명)으로 고른 기본값 — 시험결과/결과.json 의 settings 와 같다
  const DEFAULTS = {
    shrink: 20,       // 함께 본 영화가 적은 사람의 '비슷함'을 깎는 정도
    minCommon: 2,     // 최소 함께 본 영화 수
    k: 160,           // 영화마다 참고할 취향 쌍둥이 최대 인원
    prior: 1,         // 근거가 적을 때 전체 관객 쪽으로 당기는 힘
    power: 1,         // 더 비슷한 사람을 더 크게 반영하는 정도
    biasShrink: 10,   // '후한 정도' 추정을 깎는 정도
    traitWeight: 0,   // 재미 요소 취향을 예측에 더하는 정도 — 시험에서 더해도 나아지지 않아 0 (설명·기분 고르기에만 씀)
    minNeighbors: 10, // 참고할 취향 쌍둥이가 이보다 적으면 '판단 근거 부족'
  };

  // 별점x2(1~10) → 반응: 1 재밌었어요(4점 이상), 0 보통(3~3.5), -1 아쉬웠어요(2.5 이하)
  const LEVEL = new Int8Array(11);
  for (let r = 0; r <= 10; r++) LEVEL[r] = r >= 8 ? 1 : r >= 6 ? 0 : -1;

  function create(data, options) {
    const o = Object.assign({}, DEFAULTS, options);
    const { movieCount, crowdLike, crowdLevel, offsets, items } = data;
    const traits = data.traits || null;          // 영화마다 재미 요소 점수 0~1 (movieCount x T)
    const T = data.traitCount || 0;
    const userCount = offsets.length - 1;

    // 영화별 '그 영화를 본 패널 사람' 목록 (거꾸로 찾기 표)
    const mOff = new Uint32Array(movieCount + 1);
    for (let j = 0; j < items.length; j++) mOff[(items[j] >> 4) + 1]++;
    for (let m = 0; m < movieCount; m++) mOff[m + 1] += mOff[m];
    const mUser = new Uint32Array(items.length);
    const mR2 = new Uint8Array(items.length);
    const fill = mOff.slice(0, movieCount);
    const bias = new Float32Array(userCount); // 패널 사람마다 '남들보다 후한 정도'
    for (let v = 0; v < userCount; v++) {
      let s = 0;
      for (let j = offsets[v]; j < offsets[v + 1]; j++) {
        const m = items[j] >> 4, r2 = items[j] & 15;
        const p = fill[m]++;
        mUser[p] = v; mR2[p] = r2;
        s += (r2 >= 8 ? 1 : 0) - crowdLike[m];
      }
      bias[v] = s / (offsets[v + 1] - offsets[v] + o.biasShrink);
    }

    let heapS = new Float32Array(o.k), heapJ = new Int32Array(o.k);
    function setOptions(partial) {
      Object.assign(o, partial);
      if (heapS.length !== o.k) { heapS = new Float32Array(o.k); heapJ = new Int32Array(o.k); }
    }

    // 내 평가 목록 [[영화번호, 반응(1/0/-1)], ...] → 패널 사람 한 명 한 명과의 취향 비슷함
    // overrides: { 영화번호: [재미 요소 0~1 x T] } — 사용자가 '더 알려주기'로 직접 느낀 정도를 적은 영화
    function score(ratings, overrides) {
      const dot = new Float32Array(userCount), nu = new Float32Array(userCount), nv = new Float32Array(userCount);
      const cnt = new Uint16Array(userCount), agree = new Float32Array(userCount);
      let b = 0;
      for (let i = 0; i < ratings.length; i++) {
        const m = ratings[i][0], s = ratings[i][1];
        const cl = crowdLevel[m], eu = s - cl;
        b += (s === 1 ? 1 : 0) - crowdLike[m];
        for (let j = mOff[m], end = mOff[m + 1]; j < end; j++) {
          const v = mUser[j], sv = LEVEL[mR2[j]], ev = sv - cl;
          dot[v] += eu * ev; nu[v] += eu * eu; nv[v] += ev * ev; cnt[v]++;
          agree[v] += 1 - Math.abs(s - sv) / 2; // 같은 반응 1, 한 칸 차이 0.5, 정반대 0
        }
      }
      const sim = new Float32Array(userCount);
      for (let v = 0; v < userCount; v++) {
        const c = cnt[v];
        if (c >= o.minCommon && nu[v] > 1e-6 && nv[v] > 1e-6) {
          sim[v] = dot[v] / Math.sqrt(nu[v] * nv[v]) * c / (c + o.shrink);
        }
      }
      const rated = new Uint8Array(movieCount);
      for (let i = 0; i < ratings.length; i++) rated[ratings[i][0]] = 1;
      return {
        sim, cnt, agree, rated, n: ratings.length,
        bias: b / (ratings.length + o.biasShrink),
        prefs: traits ? traitPrefs(ratings, overrides) : null,
      };
    }

    // 재미 요소별로 '남들보다 좋아하는 정도' (-1~1): 내 반응이 평균보다 좋았던 영화에 그 요소가 많았나
    function traitPrefs(ratings, overrides) {
      const n = ratings.length, prefs = new Float32Array(T);
      if (n < 3) return prefs;
      // 사용자가 직접 움직인 요소만 바꾸고(null 이 아닌 값), 나머지는 원래 데이터 값을 쓴다
      const x = (m, t) => (overrides && overrides[m] && overrides[m][t] != null ? overrides[m][t] : traits[m * T + t]);
      let me = 0;
      const mx = new Float64Array(T);
      for (const [m, s] of ratings) { me += s - crowdLevel[m]; for (let t = 0; t < T; t++) mx[t] += x(m, t); }
      me /= n;
      for (let t = 0; t < T; t++) mx[t] /= n;
      let see = 0;
      const sxe = new Float64Array(T), sxx = new Float64Array(T);
      for (const [m, s] of ratings) {
        const e = s - crowdLevel[m] - me;
        see += e * e;
        for (let t = 0; t < T; t++) { const d = x(m, t) - mx[t]; sxe[t] += d * e; sxx[t] += d * d; }
      }
      for (let t = 0; t < T; t++) {
        prefs[t] = see > 1e-9 && sxx[t] > 1e-9 ? (sxe[t] / Math.sqrt(see * sxx[t])) * n / (n + 8) : 0;
      }
      return prefs;
    }

    function traitFit(prefs, m) {
      let s = 0;
      for (let t = 0; t < T; t++) s += prefs[t] * (traits[m * T + t] - 0.5);
      return s;
    }

    // 영화 하나 예측. detail 에 숫자를 주면 가장 비슷한 사람 몇 명의 반응도 돌려준다
    function predict(ctx, m, detail) {
      let size = 0;
      const sim = ctx.sim, k = o.k;
      for (let j = mOff[m], end = mOff[m + 1]; j < end; j++) {
        const s = sim[mUser[j]];
        if (s <= 0) continue;
        if (size < k) {
          let i = size++;
          while (i > 0) { const p = (i - 1) >> 1; if (heapS[p] <= s) break; heapS[i] = heapS[p]; heapJ[i] = heapJ[p]; i = p; }
          heapS[i] = s; heapJ[i] = j;
        } else if (s > heapS[0]) {
          let i = 0;
          for (;;) {
            const l = 2 * i + 1;
            if (l >= size) break;
            let c = l;
            if (l + 1 < size && heapS[l + 1] < heapS[l]) c = l + 1;
            if (heapS[c] >= s) break;
            heapS[i] = heapS[c]; heapJ[i] = heapJ[c]; i = c;
          }
          heapS[i] = s; heapJ[i] = j;
        }
      }
      let W = 0, num = 0, likes = 0, mids = 0, dislikes = 0;
      const cl = crowdLike[m];
      for (let i = 0; i < size; i++) {
        const j = heapJ[i], v = mUser[j], r2 = mR2[j];
        const w = o.power === 1 ? heapS[i] : Math.pow(heapS[i], o.power);
        W += w;
        num += w * ((r2 >= 8 ? 1 : 0) - cl - bias[v]);
        if (r2 >= 8) likes++; else if (r2 >= 6) mids++; else dislikes++;
      }
      let p = cl + ctx.bias + num / (W + o.prior);
      if (o.traitWeight && ctx.prefs) p += o.traitWeight * traitFit(ctx.prefs, m);
      p = Math.min(0.97, Math.max(0.03, p));
      const res = { p, crowd: cl, n: size, likes, mids, dislikes, weight: W, conf: confidence(W, size) };
      if (detail) {
        const order = [];
        for (let i = 0; i < size; i++) order.push(i);
        order.sort((a, b) => heapS[b] - heapS[a]);
        res.neighbors = order.slice(0, detail).map(i => {
          const v = mUser[heapJ[i]];
          return {
            sim: heapS[i],
            agree: ctx.cnt[v] ? ctx.agree[v] / ctx.cnt[v] : 0,
            common: ctx.cnt[v],
            stars: mR2[heapJ[i]] / 2,
            level: LEVEL[mR2[heapJ[i]]],
          };
        });
      }
      return res;
    }

    // 판단 근거: 시험에서 '비슷함 합계'로 나눈 신뢰도는 실제 적중률과 맞지 않았다(낮음 69.9% > 보통 68.3%).
    // 그래서 근거 인원만 보고, 확률 자체가 얼마나 맞는지는 확률대별 시험 결과(calibration.js)로 보여 준다.
    function confidence(W, n) {
      return n >= o.minNeighbors ? 'ok' : 'low';
    }

    function predictAll(ctx) {
      const p = new Float32Array(movieCount), conf = new Array(movieCount), n = new Uint16Array(movieCount);
      for (let m = 0; m < movieCount; m++) {
        const r = predict(ctx, m);
        p[m] = r.p; conf[m] = r.conf; n[m] = r.n;
      }
      return { p, conf, n };
    }

    // 내 기록으로 맞혀 보기: 평가한 영화를 하나씩 가리고 나머지로 예측해, 취향 방식과 평균 방식의 적중을 센다
    function selfCheck(ratings) {
      let taste = 0, crowd = 0;
      const rows = [];
      for (let i = 0; i < ratings.length; i++) {
        const rest = ratings.slice(0, i).concat(ratings.slice(i + 1));
        const [m, s] = ratings[i];
        const r = predict(score(rest), m);
        const liked = s === 1;
        const tHit = (r.p >= 0.5) === liked, cHit = (crowdLike[m] >= 0.5) === liked;
        if (tHit) taste++;
        if (cHit) crowd++;
        rows.push({ m, s, p: r.p, crowd: crowdLike[m], tHit, cHit });
      }
      return { n: ratings.length, taste, crowd, rows };
    }

    return { options: o, userCount, movieCount, setOptions, score, predict, predictAll, selfCheck, traitPrefs, LEVEL };
  }

  // 빠른 평가(카드 넘기기)에서 다음에 보여 줄 영화 순서 — 앱과 시험(tools/14_quickrate_experiment.js)이 같은 함수를 쓴다
  //  점수 = [볼 법한 정도] × [내 취향을 알려 주는 정도]^b
  //   볼 법한 정도 = (인기: 평가 수 로그를 0~1로)^a × 이 사람의 '본 비율'(연대 4구간·인기 3구간마다 (평가+1)/(평가+안 봤어요+2))
  //     → '안 봤어요'를 자주 누른 구간(예: 옛날 영화, 덜 알려진 영화)은 덜 보여 준다
  //   알려 주는 정도 = 4q(1−q): q = 지금 내 예측(없으면 전체 관객 비율). 50%에 가까울수록 어느 쪽일지 몰라 평가 하나가 많이 알려 줌
  //  예측 계산을 줄이려고 볼 법한 정도로 상위 top 편만 추린 뒤 곱해서 줄 세운다
  function quickRanker(movies, crowdLike, params) {
    const P = Object.assign({ a: 1, b: 1, top: 400 }, params);
    const N = crowdLike.length;
    let maxl = 0;
    for (let m = 0; m < N; m++) maxl = Math.max(maxl, Math.log1p(movies.count[m] || 0));
    const fam = new Float32Array(N);
    for (let m = 0; m < N; m++) fam[m] = Math.pow(Math.log1p(movies.count[m] || 0) / (maxl || 1), P.a);
    const byCount = Array.from({ length: N }, (_, m) => m).sort((x, y) => (movies.count[y] || 0) - (movies.count[x] || 0));
    const tier = new Uint8Array(N);
    byCount.forEach((m, i) => { tier[m] = i < N / 3 ? 0 : i < (2 * N) / 3 ? 1 : 2; });
    const dec = new Uint8Array(N);
    for (let m = 0; m < N; m++) { const y = movies.year[m] || 0; dec[m] = y < 1990 ? 0 : y < 2000 ? 1 : y < 2010 ? 2 : 3; }
    // cands: 후보 영화 번호들 · rated / skipped: 평가한 / '안 봤어요' 한 영화 번호들 · pOf(m): 지금 내 예측 (없으면 null)
    return function rank(cands, rated, skipped, pOf) {
      const dr = [1, 1, 1, 1], dn = [2, 2, 2, 2], tr = [1, 1, 1], tn = [2, 2, 2];
      for (const m of rated) { dr[dec[m]]++; dn[dec[m]]++; tr[tier[m]]++; tn[tier[m]]++; }
      for (const m of skipped) { dn[dec[m]]++; tn[tier[m]]++; }
      const seen = cands.map(m => [m, fam[m] * (dr[dec[m]] / dn[dec[m]]) * (tr[tier[m]] / tn[tier[m]])]);
      seen.sort((x, y) => y[1] - x[1]);
      const head = seen.slice(0, P.top).map(([m, s]) => {
        const q = pOf ? pOf(m) : null, r = q == null ? crowdLike[m] : q;
        return [m, s * Math.pow(4 * r * (1 - r), P.b)];
      });
      head.sort((x, y) => y[1] - x[1]);
      return head.map(x => x[0]);
    };
  }

  return { create, DEFAULTS, LEVEL, quickRanker };
});
