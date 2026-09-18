/**
 * 読み込み中・エラー・空状態
 *
 * 読み込み中に「衛星が軌道を描く」演出にしているのは、
 * 待ち時間そのものをアプリの世界観の一部にするため。
 * 汎用のスピナーだと、この数百ミリ秒がただの空白になる。
 */

export function Loading() {
  return (
    <div className="flex flex-col items-center justify-center gap-5 py-24">
      <svg
        viewBox="0 0 120 120"
        width="88"
        height="88"
        role="status"
        aria-label="軌道を計算しています"
      >
        {/* 地球 */}
        <circle cx="60" cy="60" r="15" fill="rgba(125,211,252,0.12)" />
        <circle
          cx="60"
          cy="60"
          r="15"
          fill="none"
          stroke="rgba(125,211,252,0.35)"
          strokeWidth="1"
        />
        {/* 軌道 */}
        <ellipse
          cx="60"
          cy="60"
          rx="44"
          ry="44"
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="1"
          strokeDasharray="2 5"
        />
        {/* 周回する衛星 */}
        <g style={{ transformOrigin: '60px 60px', animation: 'orbit 2.4s linear infinite' }}>
          <circle cx="104" cy="60" r="3.5" fill="#FFC46B" />
        </g>
        <style>{`@keyframes orbit { to { transform: rotate(360deg); } }`}</style>
      </svg>
      <p className="text-[13px] text-[var(--color-ink-faint)]">
        軌道を計算しています…
      </p>
    </div>
  );
}

export function ErrorPanel({ message }: { message: string | null }) {
  return (
    <div className="card p-6">
      <h2 className="text-[17px] font-semibold text-[var(--color-warn)]">
        予報を取得できませんでした
      </h2>
      <p className="mt-2 text-[13px] leading-relaxed text-[var(--color-ink-sub)]">
        {message ?? '原因が特定できません。'}
      </p>
      <p className="mt-3 text-[12px] leading-relaxed text-[var(--color-ink-faint)]">
        オフラインの場合は、通信が回復すると自動的に再取得します。
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="tap mt-4 rounded-full border border-[var(--color-edge-strong)] px-5 py-2 text-[13px]"
      >
        再読み込み
      </button>
    </div>
  );
}

export function EmptyPasses() {
  return (
    <div className="card flex flex-col items-center gap-4 p-8 text-center">
      <svg viewBox="0 0 120 120" width="96" height="96" aria-hidden="true">
        {/* 何も通らない静かな夜空 */}
        <circle
          cx="60"
          cy="60"
          r="44"
          fill="none"
          stroke="rgba(255,255,255,0.10)"
          strokeWidth="1.2"
        />
        <circle
          cx="60"
          cy="60"
          r="22"
          fill="none"
          stroke="rgba(255,255,255,0.07)"
          strokeWidth="1"
          strokeDasharray="2 5"
        />
        {[
          [44, 40],
          [78, 52],
          [58, 78],
          [88, 76],
          [38, 68],
        ].map(([x, y], index) => (
          <circle
            key={index}
            cx={x}
            cy={y}
            r="1.6"
            fill="#C7D2FE"
            opacity="0.5"
            style={{
              animation: `twinkle ${3 + index * 0.4}s ease-in-out ${index * 0.3}s infinite`,
            }}
          />
        ))}
      </svg>
      <div>
        <p className="text-[15px] font-semibold text-[var(--color-ink-sub)]">
          今後7日間、見えるパスはありません
        </p>
        <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--color-ink-faint)]">
          ISSは夜通し飛んでいますが、光って見えるのは
          <br />
          日没直後と日の出前の限られた時間だけです。
          <br />
          その条件が揃う「可視期間」は約2か月ごとに訪れます。
        </p>
      </div>
    </div>
  );
}
