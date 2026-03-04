/* ====================================
   LOTO GUARD - Application Logic
   ==================================== */

(function () {
    'use strict';

    // --- State ---
    let currentGame = 'loto6';
    let checkGame = 'loto6';

    const GAME_CONFIG = {
        loto6: { max: 43, pick: 6, label: 'LOTO6' },
        loto7: { max: 37, pick: 7, label: 'LOTO7' },
        mini: { max: 31, pick: 5, label: 'ミニロト' },
    };

    // --- DOM References ---
    const gameTabs = document.querySelectorAll('.game-tab');
    const avoidGrid = document.getElementById('avoid-grid');
    const weekLabel = document.getElementById('week-label');
    const checkInputsContainer = document.getElementById('check-inputs');
    const checkBtn = document.getElementById('check-btn');
    const checkResult = document.getElementById('check-result');
    const checkGameBtns = document.querySelectorAll('.check-game-btn');
    const analysisGrid = document.getElementById('analysis-grid');

    // =============================================
    //  Particles Background
    // =============================================
    function createParticles() {
        const container = document.getElementById('particles');
        if (!container) return;
        const count = 30;
        for (let i = 0; i < count; i++) {
            const p = document.createElement('div');
            p.className = 'particle';
            p.style.left = Math.random() * 100 + '%';
            p.style.animationDelay = Math.random() * 8 + 's';
            p.style.animationDuration = (6 + Math.random() * 6) + 's';

            // Random warning colors
            const colors = ['#ff3344', '#ff8800', '#ffcc00', '#aa44ff'];
            p.style.background = colors[Math.floor(Math.random() * colors.length)];
            p.style.width = (2 + Math.random() * 3) + 'px';
            p.style.height = p.style.width;

            container.appendChild(p);
        }
    }

    // =============================================
    //  Avoidance Card Rendering
    // =============================================
    function renderAvoidCards(gameKey) {
        avoidGrid.innerHTML = '';
        const avoidList = AvoidanceEngine.generate(gameKey);

        if (!avoidList || avoidList.length === 0) {
            avoidGrid.innerHTML = '<p style="text-align:center;color:var(--text-muted);">データが利用できません</p>';
            return;
        }

        avoidList.forEach((item, index) => {
            const card = document.createElement('div');
            card.className = 'avoid-card';
            card.style.animationDelay = `${index * 0.05}s`;

            // Score classification
            let scoreClass = 'score-low';
            let scoreLabel = '注意';
            if (item.score >= 70) { scoreClass = 'score-high'; scoreLabel = '危険'; }
            else if (item.score >= 35) { scoreClass = 'score-medium'; scoreLabel = '警告'; }

            const scorePercent = Math.min(item.score, 100);

            // Numbers — each ball gets a unique color class
            const ballColors = ['ball-c1', 'ball-c2', 'ball-c3', 'ball-c4', 'ball-c5', 'ball-c6', 'ball-c7'];
            const numbersHTML = item.numbers.map((n, idx) =>
                `<span class="avoid-ball ${ballColors[idx % ballColors.length]}">${n}</span>`
            ).join('');

            // Reason tags
            const reasonTagMap = {
                '過去当選と一致': 'duplicate',
                '頻度偏り': 'frequency',
                '合計値異常': 'sum',
                '偶奇バランス崩壊': 'evenodd',
                '連番過多': 'consecutive',
                'ゾーン偏り': 'zone',
                '算術パターン': 'arithmetic',
            };

            const reasonsHTML = item.reasons.map(r => {
                const tagClass = reasonTagMap[r.label] || 'frequency';
                return `<span class="reason-tag ${tagClass}" title="${r.detail}">${r.icon} ${r.label}</span>`;
            }).join('');

            card.innerHTML = `
                <div class="card-header">
                    <span class="card-rank">#${index + 1}</span>
                    <div class="card-score">
                        <span style="color:var(--${scoreClass === 'score-high' ? 'danger-red' : scoreClass === 'score-medium' ? 'warning-orange' : 'warning-yellow'})">${scoreLabel}</span>
                        <div class="score-bar">
                            <div class="score-fill ${scoreClass}" style="width:${scorePercent}%"></div>
                        </div>
                    </div>
                </div>
                <div class="card-numbers">
                    ${numbersHTML}
                </div>
                <div class="card-reasons">
                    ${reasonsHTML}
                </div>
            `;

            avoidGrid.appendChild(card);
        });
    }

    // =============================================
    //  Game Tab Switching
    // =============================================
    gameTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            gameTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentGame = tab.dataset.game;
            renderAvoidCards(currentGame);
            renderAnalysis(currentGame);
        });
    });

    // =============================================
    //  Number Check Feature
    // =============================================
    function renderCheckInputs(gameKey) {
        const { pick, max } = GAME_CONFIG[gameKey];
        checkInputsContainer.innerHTML = '';
        for (let i = 0; i < pick; i++) {
            const input = document.createElement('input');
            input.type = 'number';
            input.className = 'check-input';
            input.min = 1;
            input.max = max;
            input.placeholder = `${i + 1}`;
            input.id = `check-num-${i}`;

            // Auto-focus next input
            input.addEventListener('input', () => {
                if (input.value.length >= 2 && i < pick - 1) {
                    document.getElementById(`check-num-${i + 1}`).focus();
                }
            });

            checkInputsContainer.appendChild(input);
        }
    }

    checkGameBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            checkGameBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            checkGame = btn.dataset.game;
            renderCheckInputs(checkGame);
            checkResult.classList.remove('show');
        });
    });

    checkBtn.addEventListener('click', () => {
        const { pick, max } = GAME_CONFIG[checkGame];
        const numbers = [];
        let valid = true;

        for (let i = 0; i < pick; i++) {
            const input = document.getElementById(`check-num-${i}`);
            const val = parseInt(input.value);
            if (isNaN(val) || val < 1 || val > max) {
                valid = false;
                input.style.borderColor = 'var(--danger-red)';
            } else {
                input.style.borderColor = 'rgba(255, 255, 255, 0.15)';
                numbers.push(val);
            }
        }

        // Check for duplicates
        if (new Set(numbers).size !== numbers.length) {
            valid = false;
        }

        if (!valid || numbers.length !== pick) {
            checkResult.className = 'check-result show risk-medium';
            checkResult.innerHTML = `
                <div class="result-header">⚠️ 入力エラー</div>
                <p style="color:var(--text-secondary);font-size:0.85rem;">
                    1〜${max}の範囲で${pick}個の異なる数字を入力してください。
                </p>
            `;
            return;
        }

        const result = AvoidanceEngine.check(numbers, checkGame);

        checkResult.className = `check-result show risk-${result.riskLevel}`;

        let reasonsHTML = '';
        if (result.reasons.length > 0) {
            reasonsHTML = `
                <div class="result-reasons">
                    ${result.reasons.map(r => `
                        <div class="result-reason-item">
                            <span class="result-reason-icon">${r.icon}</span>
                            <div>
                                <strong>${r.label}</strong>: ${r.detail}
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        checkResult.innerHTML = `
            <div class="result-header">${result.message}</div>
            <p style="color:var(--text-secondary);font-size:0.85rem;margin-top:4px;">
                回避スコア: <strong style="color:var(--${result.riskLevel === 'high' ? 'danger-red' : result.riskLevel === 'medium' ? 'warning-orange' : 'accent-green'})">${result.score}</strong> / 100
            </p>
            ${reasonsHTML}
        `;
    });

    // =============================================
    //  Analysis Rendering
    // =============================================
    function renderAnalysis(gameKey) {
        const report = AvoidanceEngine.getReport(gameKey);
        if (!report) {
            analysisGrid.innerHTML = '<p style="text-align:center;color:var(--text-muted);">データなし</p>';
            return;
        }

        analysisGrid.innerHTML = `
            <!-- Hot Numbers -->
            <div class="analysis-card">
                <h3>🔥 直近のホット番号</h3>
                <p style="font-size:0.75rem;color:var(--text-muted);margin-bottom:8px;">直近15回で高頻度の番号</p>
                <div class="hot-nums">
                    ${report.hot.map(n => `<span class="mini-ball hot">${n}</span>`).join('')}
                </div>
            </div>

            <!-- Cold Numbers -->
            <div class="analysis-card">
                <h3>❄️ コールド番号</h3>
                <p style="font-size:0.75rem;color:var(--text-muted);margin-bottom:8px;">長期間未出現の番号</p>
                <div class="cold-nums">
                    ${report.cold.map(n => `<span class="mini-ball cold">${n}</span>`).join('')}
                </div>
            </div>

            <!-- Statistics -->
            <div class="analysis-card">
                <h3>📈 統計サマリー</h3>
                <div class="analysis-item">
                    <span>分析データ数</span>
                    <span class="analysis-value">${report.dataSize}回</span>
                </div>
                <div class="analysis-item">
                    <span>合計値レンジ</span>
                    <span class="analysis-value">${report.sumRange.min}〜${report.sumRange.max}</span>
                </div>
                <div class="analysis-item">
                    <span>合計値中央値</span>
                    <span class="analysis-value">${report.sumRange.median}</span>
                </div>
                <div class="analysis-item">
                    <span>偶数率</span>
                    <span class="analysis-value">${report.evenOddRatio}%</span>
                </div>
                <div class="analysis-item">
                    <span>連番出現率</span>
                    <span class="analysis-value">${report.consecutiveRate}%</span>
                </div>
                <div class="analysis-item">
                    <span>ゾーン分布（低/中/高）</span>
                    <span class="analysis-value">${report.zones.join('/')}%</span>
                </div>
            </div>
        `;
    }

    // =============================================
    //  SNS Share
    // =============================================
    function setupShare() {
        const twitterBtn = document.getElementById('share-twitter');
        const lineBtn = document.getElementById('share-line');
        const siteUrl = window.location.href;

        twitterBtn.addEventListener('click', () => {
            const text = `⚠️ 今週のロト番号、買う前にチェック！\n数学的根拠に基づく「買ってはいけない」組み合わせ30通り\n#LOTO #ロト6 #ロト7 #ミニロト #LOTOGUARD`;
            const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(siteUrl)}`;
            window.open(url, '_blank', 'width=550,height=420');
        });

        lineBtn.addEventListener('click', () => {
            const text = `⚠️ 今週のロト番号、買う前にチェック！ ${siteUrl}`;
            const url = `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(siteUrl)}&text=${encodeURIComponent(text)}`;
            window.open(url, '_blank', 'width=550,height=420');
        });
    }

    // =============================================
    //  Scroll Animations (Intersection Observer)
    // =============================================
    function setupScrollAnimations() {
        const elements = document.querySelectorAll('.fade-in-up');
        if (!window.IntersectionObserver) {
            elements.forEach(el => el.classList.add('visible'));
            return;
        }
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1 });

        elements.forEach(el => observer.observe(el));
    }

    // =============================================
    //  Initialize
    // =============================================
    function init() {
        createParticles();

        // Set week label
        if (weekLabel) {
            weekLabel.textContent = AvoidanceEngine.getWeekLabel();
        }

        // Render initial game
        renderAvoidCards(currentGame);
        renderAnalysis(currentGame);

        // Setup check inputs
        renderCheckInputs(checkGame);

        // Setup share
        setupShare();

        // Setup scroll animations
        setupScrollAnimations();
    }

    init();
})();
