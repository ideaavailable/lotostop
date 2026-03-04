/* ====================================
   LOTO GUARD - Avoidance Engine
   数学的・確率的分析による
   「買ってはいけない」番号生成エンジン
   ==================================== */

const AvoidanceEngine = (function () {
    'use strict';

    // --- ゲーム設定 ---
    const GAMES = {
        loto6: { max: 43, pick: 6, label: 'LOTO6' },
        loto7: { max: 37, pick: 7, label: 'LOTO7' },
        mini: { max: 31, pick: 5, label: 'ミニロト' },
    };

    // --- 今週のシード生成（週ごとに固定化）---
    function getWeeklySeed() {
        const now = new Date();
        const year = now.getFullYear();
        const weekNum = Math.ceil(
            ((now - new Date(year, 0, 1)) / 86400000 + new Date(year, 0, 1).getDay() + 1) / 7
        );
        return year * 100 + weekNum;
    }

    // --- シード付き擬似乱数 ---
    function seededRandom(seed) {
        let s = seed;
        return function () {
            s = (s * 1103515245 + 12345) & 0x7fffffff;
            return s / 0x7fffffff;
        };
    }

    // =============================================
    //  分析関数群
    // =============================================

    // 1. 出現頻度分析
    function computeFrequencies(history, maxNum) {
        const freq = new Array(maxNum + 1).fill(0);
        history.forEach(draw => {
            draw.forEach(n => freq[n]++);
        });
        return freq;
    }

    // 2. 直近トレンド（ホット/コールド）
    function computeRecentTrend(history, maxNum, recentCount) {
        const recent = history.slice(0, recentCount);
        const older = history.slice(recentCount, recentCount * 2);
        const recentFreq = new Array(maxNum + 1).fill(0);
        const olderFreq = new Array(maxNum + 1).fill(0);
        recent.forEach(draw => draw.forEach(n => recentFreq[n]++));
        older.forEach(draw => draw.forEach(n => olderFreq[n]++));
        const trend = new Array(maxNum + 1).fill(0);
        for (let i = 1; i <= maxNum; i++) {
            trend[i] = (recentFreq[i] / Math.max(recent.length, 1)) -
                (olderFreq[i] / Math.max(older.length, 1));
        }
        return { trend, recentFreq, olderFreq };
    }

    // 3. 出現間隔（ギャップ）分析
    function computeGaps(history, maxNum) {
        const lastSeen = new Array(maxNum + 1).fill(Infinity);
        for (let i = 0; i < history.length; i++) {
            history[i].forEach(n => {
                if (lastSeen[n] === Infinity) {
                    lastSeen[n] = i;
                }
            });
        }
        return lastSeen;
    }

    // 4. 合計値の統計分析（IQR方式）
    function computeSumStats(history) {
        const sums = history.map(draw => draw.reduce((a, b) => a + b, 0));
        sums.sort((a, b) => a - b);
        const q1 = sums[Math.floor(sums.length * 0.25)];
        const q3 = sums[Math.floor(sums.length * 0.75)];
        const median = sums[Math.floor(sums.length * 0.5)];
        const iqr = q3 - q1;
        return {
            q1, q3, median, iqr,
            lowerFence: q1 - 1.5 * iqr,
            upperFence: q3 + 1.5 * iqr,
        };
    }

    // 5. 偶数/奇数バランス分析
    function computeEvenOddRatio(history) {
        let totalEvens = 0;
        let totalNums = 0;
        history.forEach(draw => {
            draw.forEach(n => {
                if (n % 2 === 0) totalEvens++;
                totalNums++;
            });
        });
        return totalEvens / totalNums;
    }

    // 6. ゾーン分布分析
    function computeZoneDistribution(history, maxNum) {
        const third = maxNum / 3;
        const zones = [0, 0, 0];
        let total = 0;
        history.forEach(draw => {
            draw.forEach(n => {
                if (n <= third) zones[0]++;
                else if (n <= third * 2) zones[1]++;
                else zones[2]++;
                total++;
            });
        });
        return zones.map(z => z / total);
    }

    // 7. 連番ペア頻度
    function computeConsecutiveRate(history) {
        let totalPairs = 0;
        let consecutivePairs = 0;
        history.forEach(draw => {
            for (let i = 0; i < draw.length - 1; i++) {
                totalPairs++;
                if (draw[i + 1] - draw[i] === 1) consecutivePairs++;
            }
        });
        return consecutivePairs / totalPairs;
    }

    // =============================================
    //  回避理由の判定関数群
    // =============================================

    // 理由1: 過去当選番号と完全一致
    function checkDuplicate(combo, history) {
        const key = combo.join(',');
        return history.some(draw => draw.join(',') === key);
    }

    // 理由2: 出現頻度の極端な偏り（全て高頻度 or 全て低頻度）
    function checkFrequencyBias(combo, freq, totalDraws) {
        const avgFreq = totalDraws * (combo.length / 43); // 期待出現回数の概算
        const comboFreqs = combo.map(n => freq[n]);
        const allHigh = comboFreqs.every(f => f >= avgFreq * 1.3);
        const allLow = comboFreqs.every(f => f <= avgFreq * 0.7);
        if (allHigh) return { hit: true, detail: '全番号が高頻度（統計的に偏りすぎ）' };
        if (allLow) return { hit: true, detail: '全番号が低頻度（統計的に偏りすぎ）' };
        return { hit: false };
    }

    // 理由3: 合計値が統計的外れ値
    function checkSumOutlier(combo, sumStats) {
        const sum = combo.reduce((a, b) => a + b, 0);
        if (sum < sumStats.lowerFence) {
            return { hit: true, detail: `合計値 ${sum} が下限 ${Math.round(sumStats.lowerFence)} 未満` };
        }
        if (sum > sumStats.upperFence) {
            return { hit: true, detail: `合計値 ${sum} が上限 ${Math.round(sumStats.upperFence)} 超過` };
        }
        return { hit: false };
    }

    // 理由4: 偶数/奇数バランスの崩壊
    function checkEvenOddImbalance(combo) {
        const evens = combo.filter(n => n % 2 === 0).length;
        const evenRatio = evens / combo.length;
        if (evenRatio === 0) return { hit: true, detail: '全て奇数（確率: 極めて低い）' };
        if (evenRatio === 1) return { hit: true, detail: '全て偶数（確率: 極めて低い）' };
        if (evenRatio <= 0.15 || evenRatio >= 0.85) {
            return { hit: true, detail: `偶奇比 ${evens}:${combo.length - evens}（極端な偏り）` };
        }
        return { hit: false };
    }

    // 理由5: 連番過多
    function checkConsecutiveExcess(combo) {
        let maxRun = 1;
        let currentRun = 1;
        let totalConsecutive = 0;
        for (let i = 1; i < combo.length; i++) {
            if (combo[i] - combo[i - 1] === 1) {
                currentRun++;
                totalConsecutive++;
                maxRun = Math.max(maxRun, currentRun);
            } else {
                currentRun = 1;
            }
        }
        if (maxRun >= 3) {
            return { hit: true, detail: `${maxRun}連番を含む（当選実績: 極めて稀）` };
        }
        if (totalConsecutive >= 3) {
            return { hit: true, detail: `連番ペアが${totalConsecutive}組（過多）` };
        }
        return { hit: false };
    }

    // 理由6: ゾーン偏り（一つのゾーンに集中）
    function checkZoneBias(combo, maxNum) {
        const third = maxNum / 3;
        let low = 0, mid = 0, high = 0;
        combo.forEach(n => {
            if (n <= third) low++;
            else if (n <= third * 2) mid++;
            else high++;
        });
        const total = combo.length;
        if (low === total) return { hit: true, detail: '全て低域番号に集中' };
        if (mid === total) return { hit: true, detail: '全て中域番号に集中' };
        if (high === total) return { hit: true, detail: '全て高域番号に集中' };
        if (low / total >= 0.8) return { hit: true, detail: `低域に${low}/${total}が集中` };
        if (mid / total >= 0.8) return { hit: true, detail: `中域に${mid}/${total}が集中` };
        if (high / total >= 0.8) return { hit: true, detail: `高域に${high}/${total}が集中` };
        return { hit: false };
    }

    // 理由7: 等差数列・算術パターン
    function checkArithmeticPattern(combo) {
        // 完全等差数列チェック
        const diffs = [];
        for (let i = 1; i < combo.length; i++) {
            diffs.push(combo[i] - combo[i - 1]);
        }
        const allSame = diffs.every(d => d === diffs[0]);
        if (allSame && combo.length >= 4) {
            return { hit: true, detail: `完全等差数列（公差 ${diffs[0]}）` };
        }

        // 等差サブセットチェック（4個以上が等差）
        for (let d = 1; d <= 10; d++) {
            let maxRun = 1;
            let currentRun = 1;
            for (let i = 1; i < combo.length; i++) {
                if (combo[i] - combo[i - 1] === d) {
                    currentRun++;
                    maxRun = Math.max(maxRun, currentRun);
                } else {
                    currentRun = 1;
                }
            }
            if (maxRun >= 4) {
                return { hit: true, detail: `等差パターン（公差${d}で${maxRun}個連続）` };
            }
        }
        return { hit: false };
    }

    // =============================================
    //  回避スコア計算
    // =============================================
    function computeAvoidanceScore(combo, analysisData, maxNum) {
        let score = 0;
        const reasons = [];

        // 理由1: 過去重複
        if (checkDuplicate(combo, analysisData.history)) {
            score += 100;
            reasons.push({ icon: '🔄', label: '過去当選と一致', detail: '過去の当選番号と完全一致する組み合わせ' });
        }

        // 理由2: 頻度偏り
        const freqCheck = checkFrequencyBias(combo, analysisData.freq, analysisData.history.length);
        if (freqCheck.hit) {
            score += 30;
            reasons.push({ icon: '📊', label: '頻度偏り', detail: freqCheck.detail });
        }

        // 理由3: 合計外れ値
        const sumCheck = checkSumOutlier(combo, analysisData.sumStats);
        if (sumCheck.hit) {
            score += 40;
            reasons.push({ icon: '🔢', label: '合計値異常', detail: sumCheck.detail });
        }

        // 理由4: 偶奇崩壊
        const eoCheck = checkEvenOddImbalance(combo);
        if (eoCheck.hit) {
            score += 35;
            reasons.push({ icon: '⚖️', label: '偶奇バランス崩壊', detail: eoCheck.detail });
        }

        // 理由5: 連番過多
        const consCheck = checkConsecutiveExcess(combo);
        if (consCheck.hit) {
            score += 35;
            reasons.push({ icon: '🔗', label: '連番過多', detail: consCheck.detail });
        }

        // 理由6: ゾーン偏り
        const zoneCheck = checkZoneBias(combo, maxNum);
        if (zoneCheck.hit) {
            score += 30;
            reasons.push({ icon: '🎯', label: 'ゾーン偏り', detail: zoneCheck.detail });
        }

        // 理由7: 等差パターン
        const arithCheck = checkArithmeticPattern(combo);
        if (arithCheck.hit) {
            score += 45;
            reasons.push({ icon: '📐', label: '算術パターン', detail: arithCheck.detail });
        }

        return { score, reasons };
    }

    // =============================================
    //  メイン: 回避組み合わせ30通りを生成
    // =============================================
    function generateAvoidList(gameKey) {
        const game = GAMES[gameKey];
        if (!game) return null;

        const history = HISTORICAL_DATA[gameKey];
        if (!history || history.length === 0) return null;

        const { max, pick } = game;

        // 分析データの事前計算
        const freq = computeFrequencies(history, max);
        const sumStats = computeSumStats(history);
        const analysisData = { history, freq, sumStats };

        // 週ごとのシード
        const weekSeed = getWeeklySeed();
        const gameOffset = gameKey === 'loto6' ? 1111 : gameKey === 'loto7' ? 2222 : 3333;
        const rng = seededRandom(weekSeed + gameOffset);

        const avoidList = [];
        const seen = new Set();
        const maxAttempts = 5000;

        // 戦略的に異なるタイプの「悪い」組み合わせを生成
        const generators = [
            // タイプA: 全数字を低域に集中
            () => generateFromZone(1, Math.floor(max / 3), pick, rng),
            // タイプB: 全数字を高域に集中
            () => generateFromZone(Math.ceil(max * 2 / 3), max, pick, rng),
            // タイプC: 全偶数
            () => generateAllEvenOrOdd(max, pick, true, rng),
            // タイプD: 全奇数
            () => generateAllEvenOrOdd(max, pick, false, rng),
            // タイプE: 連番パターン
            () => generateConsecutiveHeavy(max, pick, rng),
            // タイプF: 等差数列パターン
            () => generateArithmeticSeq(max, pick, rng),
            // タイプG: 極端に低い合計値
            () => generateExtremeSumLow(max, pick, rng),
            // タイプH: 極端に高い合計値
            () => generateExtremeSumHigh(max, pick, rng),
            // タイプI: ランダム生成 → 回避スコアが高いものを選別
            () => generateRandomBad(max, pick, analysisData, rng),
        ];

        let attempt = 0;
        while (avoidList.length < 30 && attempt < maxAttempts) {
            attempt++;
            // ジェネレータをローテーション
            const genIndex = attempt % generators.length;
            const combo = generators[genIndex]();

            if (!combo || combo.length !== pick) continue;

            // ソートしてユニーク化
            combo.sort((a, b) => a - b);
            const key = combo.join(',');
            if (seen.has(key)) continue;

            // 範囲チェック
            if (combo.some(n => n < 1 || n > max)) continue;
            // 重複チェック
            if (new Set(combo).size !== pick) continue;

            // 回避スコア計算
            const { score, reasons } = computeAvoidanceScore(combo, analysisData, max);

            // スコアが0の場合（回避理由なし）はスキップ
            if (score === 0) continue;

            seen.add(key);
            avoidList.push({
                numbers: combo,
                score,
                reasons,
            });
        }

        // スコアの高い順にソート
        avoidList.sort((a, b) => b.score - a.score);

        // 上位30件を返す
        return avoidList.slice(0, 30);
    }

    // =============================================
    //  組み合わせ生成ヘルパー群
    // =============================================

    function generateFromZone(min, max, pick, rng) {
        const combo = new Set();
        let tries = 0;
        while (combo.size < pick && tries < 100) {
            combo.add(Math.floor(rng() * (max - min + 1)) + min);
            tries++;
        }
        return [...combo];
    }

    function generateAllEvenOrOdd(max, pick, isEven, rng) {
        const pool = [];
        for (let i = 1; i <= max; i++) {
            if (isEven ? (i % 2 === 0) : (i % 2 !== 0)) pool.push(i);
        }
        const combo = [];
        const used = new Set();
        let tries = 0;
        while (combo.length < pick && tries < 100) {
            const idx = Math.floor(rng() * pool.length);
            if (!used.has(pool[idx])) {
                used.add(pool[idx]);
                combo.push(pool[idx]);
            }
            tries++;
        }
        return combo;
    }

    function generateConsecutiveHeavy(max, pick, rng) {
        // 3〜pick個の連番を含む組み合わせ
        const startConsec = Math.floor(rng() * (max - pick)) + 1;
        const consecLen = Math.min(3 + Math.floor(rng() * 2), pick);
        const combo = new Set();
        for (let i = 0; i < consecLen && startConsec + i <= max; i++) {
            combo.add(startConsec + i);
        }
        let tries = 0;
        while (combo.size < pick && tries < 100) {
            combo.add(Math.floor(rng() * max) + 1);
            tries++;
        }
        return [...combo];
    }

    function generateArithmeticSeq(max, pick, rng) {
        // 等差数列（公差2〜8）
        const diff = Math.floor(rng() * 7) + 2;
        const start = Math.floor(rng() * (max - diff * (pick - 1))) + 1;
        if (start < 1 || start + diff * (pick - 1) > max) {
            // フォールバック: 小さい公差
            const d = 2;
            const s = Math.floor(rng() * (max - d * (pick - 1))) + 1;
            return Array.from({ length: pick }, (_, i) => s + d * i);
        }
        return Array.from({ length: pick }, (_, i) => start + diff * i);
    }

    function generateExtremeSumLow(max, pick, rng) {
        // 最も小さい数字付近をランダムに
        const combo = new Set();
        let tries = 0;
        while (combo.size < pick && tries < 100) {
            combo.add(Math.floor(rng() * Math.ceil(max * 0.35)) + 1);
            tries++;
        }
        return [...combo];
    }

    function generateExtremeSumHigh(max, pick, rng) {
        // 最も大きい数字付近をランダムに
        const combo = new Set();
        let tries = 0;
        while (combo.size < pick && tries < 100) {
            const n = max - Math.floor(rng() * Math.ceil(max * 0.35));
            if (n >= 1) combo.add(n);
            tries++;
        }
        return [...combo];
    }

    function generateRandomBad(max, pick, analysisData, rng) {
        // ランダム生成して回避スコアをチェック
        const combo = new Set();
        let tries = 0;
        while (combo.size < pick && tries < 100) {
            combo.add(Math.floor(rng() * max) + 1);
            tries++;
        }
        return [...combo];
    }

    // =============================================
    //  ユーザー番号チェック機能
    // =============================================
    function checkUserNumbers(numbers, gameKey) {
        const game = GAMES[gameKey];
        if (!game) return null;

        const history = HISTORICAL_DATA[gameKey];
        if (!history || history.length === 0) return null;

        const { max } = game;
        const freq = computeFrequencies(history, max);
        const sumStats = computeSumStats(history);
        const analysisData = { history, freq, sumStats };

        const sorted = [...numbers].sort((a, b) => a - b);
        const { score, reasons } = computeAvoidanceScore(sorted, analysisData, max);

        let riskLevel;
        if (score >= 70) riskLevel = 'high';
        else if (score >= 30) riskLevel = 'medium';
        else riskLevel = 'low';

        return {
            numbers: sorted,
            score,
            reasons,
            riskLevel,
            message: score === 0
                ? '✅ この組み合わせに特に問題は見つかりませんでした。'
                : `⚠️ ${reasons.length}件の回避理由が検出されました。`,
        };
    }

    // =============================================
    //  分析レポート生成
    // =============================================
    function getAnalysisReport(gameKey) {
        const game = GAMES[gameKey];
        if (!game) return null;

        const history = HISTORICAL_DATA[gameKey];
        if (!history || history.length === 0) return null;

        const { max, label } = game;
        const freq = computeFrequencies(history, max);
        const { recentFreq } = computeRecentTrend(history, max, 15);
        const gaps = computeGaps(history, max);
        const sumStats = computeSumStats(history);
        const evenOddRatio = computeEvenOddRatio(history);
        const zones = computeZoneDistribution(history, max);
        const consecRate = computeConsecutiveRate(history);

        // ホット番号
        const hotNums = [];
        for (let i = 1; i <= max; i++) hotNums.push({ num: i, freq: recentFreq[i] });
        hotNums.sort((a, b) => b.freq - a.freq);

        // コールド番号
        const coldNums = [];
        for (let i = 1; i <= max; i++) coldNums.push({ num: i, gap: gaps[i] });
        coldNums.sort((a, b) => b.gap - a.gap);

        return {
            label,
            dataSize: history.length,
            hot: hotNums.slice(0, 5).map(x => x.num),
            cold: coldNums.slice(0, 5).map(x => x.num),
            sumRange: { min: sumStats.q1, max: sumStats.q3, median: sumStats.median },
            evenOddRatio: Math.round(evenOddRatio * 100),
            zones: zones.map(z => Math.round(z * 100)),
            consecutiveRate: Math.round(consecRate * 100),
        };
    }

    // --- Public API ---
    return {
        generate: generateAvoidList,
        check: checkUserNumbers,
        getReport: getAnalysisReport,
        getWeekLabel: function () {
            const now = new Date();
            const month = now.getMonth() + 1;
            const day = now.getDate();
            const weekDay = ['日', '月', '火', '水', '木', '金', '土'][now.getDay()];
            return `${now.getFullYear()}年${month}月第${Math.ceil(day / 7)}週`;
        },
    };
})();
