import { t } from "./i18n";
import { useId } from "react";
import type { Art as ArtType } from "./types";
export const artNames: Record<ArtType, string> = {
  arch: "Задачи",
  orbit: "Космос",
  layers: "Объекты",
  bloom: "Природа",
  chip: "Процессор",
  circuit: "Плата",
  server: "Сервер",
  network: "Сеть",
};
export function Art({
  kind,
  className = "",
}: {
  kind: ArtType;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  const colors = {
    orbit: ["#aec8df", "#3f687e", "#e0e8cd"],
    arch: ["#e9b699", "#99695b", "#f2d8a8"],
    layers: ["#c6b6e4", "#82739d", "#e0dea7"],
    bloom: ["#b5c9a2", "#4e705d", "#e5d5aa"],
    chip: ["#b5bfd9", "#535d7e", "#e5def5"],
    circuit: ["#9fbfb2", "#3b625d", "#d7e8b4"],
    server: ["#a8bfd2", "#465c76", "#d8e5ec"],
    network: ["#beb4d0", "#655b7d", "#f1d5a4"],
  }[kind];
  return (
    <svg
      viewBox="0 0 500 400"
      preserveAspectRatio="xMidYMid slice"
      className={`project-art ${className}`}
      role="img"
      aria-label={t(artNames[kind])}
    >
      <defs>
        <linearGradient id={`${id}bg`} x2="1" y2="1">
          <stop stopColor={colors[0]} />
          <stop offset="1" stopColor={colors[1]} />
        </linearGradient>
        <linearGradient id={`${id}obj`} x2="0.8" y2="1">
          <stop stopColor={colors[2]} />
          <stop offset="1" stopColor={colors[0]} />
        </linearGradient>
        <filter id={`${id}shadow`}>
          <feDropShadow
            dx="0"
            dy="18"
            stdDeviation="13"
            floodColor="#1b2224"
            floodOpacity=".22"
          />
        </filter>
        <pattern
          id={`${id}grid`}
          width="38"
          height="38"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M38 0H0V38"
            fill="none"
            stroke="#fff"
            strokeOpacity=".15"
            strokeWidth=".8"
          />
        </pattern>
      </defs>
      <rect width="500" height="400" fill={`url(#${id}bg)`} />
      <rect width="500" height="400" fill={`url(#${id}grid)`} />
      <circle cx="410" cy="62" r="88" fill="#fff" opacity=".1" />
      <circle cx="42" cy="360" r="155" fill="#131d24" opacity=".06" />
      {kind === "orbit" && (
        <g transform="translate(250 195)">
          <circle r="98" fill={`url(#${id}obj)`} filter={`url(#${id}shadow)`} />
          <path
            d="M-87 -42Q-10 -10 86 -46M-96 -13Q0 25 97 -17M-90 30Q0 68 89 34"
            fill="none"
            stroke={colors[1]}
            strokeWidth="10"
            opacity=".25"
          />
          <ellipse
            rx="179"
            ry="51"
            transform="rotate(-27)"
            fill="none"
            stroke="#e1eac9"
            strokeWidth="17"
          />
          <ellipse
            rx="183"
            ry="56"
            transform="rotate(-27)"
            fill="none"
            stroke="#fff"
            opacity=".55"
          />
          <circle cx="133" cy="-100" r="15" fill="#f2e5b5" />
          <path
            d="M-161 -115v22m-11-11h22M147 107v16m-8-8h16"
            stroke="#e7f1e7"
            strokeWidth="2"
          />
        </g>
      )}
      {kind === "arch" && (
        <g>
          <ellipse
            cx="252"
            cy="340"
            rx="133"
            ry="18"
            fill="#654d48"
            opacity=".18"
          />
          <g transform="rotate(-7 250 200)" filter={`url(#${id}shadow)`}>
            <rect
              x="153"
              y="64"
              width="205"
              height="270"
              rx="20"
              fill="#b78169"
            />
            <rect
              x="141"
              y="54"
              width="205"
              height="270"
              rx="20"
              fill={`url(#${id}obj)`}
              stroke="#fff1d4"
              strokeOpacity=".6"
            />
            <rect
              x="205"
              y="42"
              width="78"
              height="29"
              rx="10"
              fill="#936d5d"
            />
            <path
              d="M225 54h38"
              stroke="#f2d8a8"
              strokeWidth="4"
              strokeLinecap="round"
            />
            {[112, 177, 242].map((y, i) => (
              <g key={y}>
                <rect
                  x="166"
                  y={y}
                  width="29"
                  height="29"
                  rx="8"
                  fill={i < 2 ? "#7b907b" : "#e5c295"}
                />
                {i < 2 && (
                  <path
                    d={`M174 ${y + 15}l5 5 9-11`}
                    fill="none"
                    stroke="#fff5d9"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
                <path
                  d={`M211 ${y + 9}h84M211 ${y + 22}h${i === 1 ? 53 : 67}`}
                  stroke="#966e5b"
                  strokeWidth="5"
                  strokeLinecap="round"
                  opacity={i < 2 ? 0.65 : 0.4}
                />
              </g>
            ))}
            <path
              d="M166 158h155M166 223h155"
              stroke="#ab8067"
              strokeOpacity=".2"
            />
          </g>
          <g transform="rotate(9 350 288)" filter={`url(#${id}shadow)`}>
            <rect
              x="288"
              y="257"
              width="111"
              height="66"
              rx="14"
              fill="#7b907b"
              stroke="#e8e6c9"
              strokeOpacity=".6"
            />
            <circle cx="314" cy="282" r="8" fill="#f5dfad" />
            <path
              d="M334 281h43M307 303h70"
              stroke="#edf0d8"
              strokeWidth="4"
              strokeLinecap="round"
              opacity=".8"
            />
          </g>
        </g>
      )}
      {kind === "layers" && (
        <g transform="translate(250 195)" filter={`url(#${id}shadow)`}>
          {[80, 22, -36, -94].map((y, i) => (
            <g key={y} transform={`translate(0 ${y})`}>
              <path
                d="M-124 0L0-67 124 0 0 67z"
                fill={i === 3 ? colors[2] : colors[0]}
                stroke="#e9e0f4"
              />
              <path d="M-124 0v25L0 93V67z" fill={colors[1]} stroke="#a99abd" />
              <path
                d="M124 0v25L0 93V67z"
                fill={i === 3 ? "#b3b889" : "#9a88bb"}
                stroke="#a99abd"
              />
              <path
                d="M-124 0L0 67 124 0"
                fill="none"
                stroke="#f6f0e7"
                opacity=".55"
              />
            </g>
          ))}
          <ellipse cy="-94" rx="37" ry="18" fill="none" stroke="#a297b5" />
          <ellipse cy="-94" rx="28" ry="12" fill="none" stroke="#615a6e" />
        </g>
      )}
      {kind === "bloom" && (
        <g transform="translate(250 208)" filter={`url(#${id}shadow)`}>
          {[0, 60, 120, 180, 240, 300].map((a) => (
            <ellipse
              key={a}
              cy="-70"
              rx="43"
              ry="86"
              transform={`rotate(${a})`}
              fill={`url(#${id}obj)`}
              stroke="#e9e9ce"
              strokeOpacity=".45"
            />
          ))}
          <circle r="45" fill="#e2ca87" stroke="#c5b077" />
          <circle
            r="32"
            fill="none"
            stroke="#fff6c9"
            strokeDasharray="2 6"
            strokeWidth="3"
          />
        </g>
      )}
      {kind === "chip" && (
        <g filter={`url(#${id}shadow)`}>
          <ellipse
            cx="250"
            cy="320"
            rx="137"
            ry="22"
            fill={colors[1]}
            opacity=".22"
          />
          <path d="M107 186v30l143 83v-30z" fill="#596179" />
          <path d="M393 186v30l-143 83v-30z" fill="#77819b" />
          <g transform="translate(250 186) scale(1 .58) rotate(45)">
            <g stroke={colors[2]} strokeWidth="7" strokeLinecap="round">
              {Array.from({ length: 8 }, (_, i) => {
                const p = -77 + i * 22;
                return (
                  <path
                    key={i}
                    d={`M${p} -100v-27M${p} 100v27M-100 ${p}h-27M100 ${p}h27`}
                  />
                );
              })}
            </g>
            <rect
              x="-101"
              y="-101"
              width="202"
              height="202"
              rx="9"
              fill={colors[1]}
              stroke="#e0e5fa"
              strokeWidth="2"
            />
            <rect
              x="-82"
              y="-82"
              width="164"
              height="164"
              rx="5"
              fill={`url(#${id}obj)`}
              stroke="#f0ecff"
            />
            <rect
              x="-49"
              y="-49"
              width="98"
              height="98"
              rx="3"
              fill="#7884a6"
              stroke="#eef2ff"
              strokeWidth="2"
            />
            <path
              d="M-35-35H-5V-5H-35zM5-35H35V-5H5zM-35 5H-5V35H-35zM5 5H35V35H5z"
              fill="#c9d7ee"
              opacity=".8"
            />
            <path
              d="M-76-63H-60M60 63H76M-76 63H-60M60-63H76"
              stroke="#9095af"
              strokeWidth="3"
            />
            <circle cx="-68" cy="-68" r="4" fill="#fff6d3" />
          </g>
        </g>
      )}
      {kind === "circuit" && (
        <g filter={`url(#${id}shadow)`}>
          <ellipse
            cx="250"
            cy="315"
            rx="145"
            ry="23"
            fill="#244d48"
            opacity=".18"
          />
          <path d="M109 182v22l141 82v-22z" fill="#375d53" />
          <path d="M391 182v22l-141 82v-22z" fill="#5c8877" />
          <g transform="translate(250 182) scale(1 .58) rotate(45)">
            <rect
              x="-100"
              y="-100"
              width="200"
              height="200"
              rx="7"
              fill="#4c7f70"
              stroke="#d2e6c2"
              strokeWidth="2"
            />
            <g fill="none" stroke={colors[2]} strokeWidth="2" opacity=".8">
              <path d="M-35-26H-62V-68H-83M-20-37V-78H28M0-37V-58H70V-80M35-20H78V18H90M35 0H58V45H83M30 35V80H64M10 35V62H-20V85M-20 35V54H-67V79M-35 10H-80V-12M-35-7H-59V-42H-87" />
              {[
                [-83, -68],
                [28, -78],
                [70, -80],
                [90, 18],
                [83, 45],
                [64, 80],
                [-20, 85],
                [-67, 79],
                [-80, -12],
                [-87, -42],
              ].map(([x, y]) => (
                <circle key={`${x}-${y}`} cx={x} cy={y} r="3" fill="#9cbf8d" />
              ))}
            </g>
            <g fill="#b7c4b3" stroke="#37584d">
              {[
                [-82, -47],
                [-73, 23],
                [53, -55],
                [48, 55],
              ].map(([x, y]) => (
                <rect
                  key={`${x}-${y}`}
                  x={x}
                  y={y}
                  width="21"
                  height="12"
                  rx="2"
                />
              ))}
            </g>
            <g stroke="#dfe8c3" strokeWidth="4">
              {[-24, -12, 0, 12, 24].map((p) => (
                <path
                  key={p}
                  d={`M${p}-35v-8M${p} 35v8M-35 ${p}h-8M35 ${p}h8`}
                />
              ))}
            </g>
            <rect
              x="-35"
              y="-35"
              width="70"
              height="70"
              rx="4"
              fill="#344c4a"
              stroke="#abc5ad"
              strokeWidth="2"
            />
            <rect
              x="-22"
              y="-22"
              width="44"
              height="44"
              rx="2"
              fill="#638c7a"
              stroke="#bcd5ad"
            />
            <g fill="#c4d8b9" stroke="#5c8976" strokeWidth="2">
              {[
                [-87, -87],
                [87, -87],
                [-87, 87],
                [87, 87],
              ].map(([x, y]) => (
                <circle key={`${x}-${y}`} cx={x} cy={y} r="5" />
              ))}
            </g>
            <path
              d="M-48 95h12m7 0h12m7 0H2m7 0h12m7 0h12"
              stroke="#e5ce8e"
              strokeWidth="6"
            />
          </g>
        </g>
      )}
      {kind === "server" && (
        <g filter={`url(#${id}shadow)`}>
          <ellipse
            cx="254"
            cy="340"
            rx="128"
            ry="21"
            fill="#31435a"
            opacity=".2"
          />
          {[0, 1, 2, 3].map((i) => {
            const y = 95 + i * 59;
            return (
              <g key={i}>
                <path
                  d={`M150 ${y}l30-18h170l-30 18z`}
                  fill={colors[2]}
                  stroke="#d8e4ed"
                />
                <path
                  d={`M320 ${y}l30-18v45l-30 18z`}
                  fill={colors[1]}
                  stroke="#607a91"
                />
                <rect
                  x="150"
                  y={y}
                  width="170"
                  height="45"
                  rx="4"
                  fill={i === 0 ? "#788fa6" : "#698097"}
                  stroke="#c3d3df"
                />
                <rect
                  x="162"
                  y={y + 13}
                  width="30"
                  height="18"
                  rx="3"
                  fill="#40546c"
                  stroke="#a2bacb"
                />
                <path
                  d={`M169 ${y + 18}h16m-16 7h16`}
                  stroke="#c5d6e2"
                  strokeWidth="2"
                />
                {Array.from({ length: 7 }, (_, j) => (
                  <path
                    key={j}
                    d={`M${211 + j * 8} ${y + 14}v17`}
                    stroke="#40566c"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                ))}
                <circle cx="296" cy={y + 17} r="3" fill="#d8eabb" />
                <circle cx="296" cy={y + 28} r="2" fill="#a6d6df" />
                <path d={`M156 ${y + 41}h158`} stroke="#eef4f8" opacity=".35" />
              </g>
            );
          })}
        </g>
      )}
      {kind === "network" && (
        <g filter={`url(#${id}shadow)`}>
          <ellipse
            cx="250"
            cy="334"
            rx="150"
            ry="23"
            fill="#4d4267"
            opacity=".12"
          />
          <g
            fill="none"
            stroke={colors[2]}
            strokeWidth="3"
            strokeLinejoin="round"
          >
            <path d="M250 199L140 127M250 199L360 127M250 212L140 284M250 212L360 284" />
            <path
              d="M140 127L250 65 360 127M140 284l110 62 110-62"
              strokeWidth="1"
              strokeOpacity=".4"
              strokeDasharray="4 7"
            />
          </g>
          {[
            [140, 127],
            [360, 127],
            [140, 284],
            [360, 284],
          ].map(([x, y], i) => (
            <g key={i}>
              <ellipse
                cx={x}
                cy={y + 28}
                rx="31"
                ry="10"
                fill="#524966"
                opacity=".18"
              />
              <path
                d={`M${x - 24} ${y}v20a24 14 0 0048 0v-20z`}
                fill="#8c81a8"
                stroke="#c0b4d6"
              />
              <ellipse
                cx={x}
                cy={y}
                rx="24"
                ry="14"
                fill={`url(#${id}obj)`}
                stroke="#eee4f2"
              />
              <ellipse
                cx={x}
                cy={y}
                rx="9"
                ry="5"
                fill="#b5a2c1"
                stroke="#f3e5ce"
              />
              <circle cx={x} cy={y + 20} r="2" fill="#f6e5b9" />
            </g>
          ))}
          <path
            d="M202 193v32a48 27 0 0096 0v-32z"
            fill="#8a7d9e"
            stroke="#d7c6df"
          />
          <ellipse
            cx="250"
            cy="193"
            rx="48"
            ry="27"
            fill={`url(#${id}obj)`}
            stroke="#f4e7e8"
            strokeWidth="2"
          />
          <ellipse
            cx="250"
            cy="193"
            rx="30"
            ry="16"
            fill="none"
            stroke="#a38daa"
            strokeWidth="2"
          />
          <ellipse
            cx="250"
            cy="193"
            rx="17"
            ry="9"
            fill="#f2d6a1"
            stroke="#fff0cb"
          />
          <path d="M215 226q35 15 70 0" fill="none" stroke="#c6b6d3" />
          <g fill="#fff0c8">
            <circle cx="195" cy="163" r="3" />
            <circle cx="305" cy="163" r="3" />
            <circle cx="194" cy="249" r="3" />
            <circle cx="306" cy="249" r="3" />
          </g>
        </g>
      )}
      <g fill="none" stroke="#fff" strokeOpacity=".55">
        <path d="M25 53V25h28M447 25h28v28M25 347v28h28M447 375h28v-28" />
        <circle cx="43" cy="43" r="2" />
      </g>
    </svg>
  );
}

export function FolderObject() {
  const id = useId().replace(/:/g, "");
  return (
    <span className="folder-object" aria-hidden="true">
      <svg
        className="folder-back"
        viewBox="0 0 115 88"
        fill="none"
        focusable="false"
      >
        <defs>
          <linearGradient
            id={`${id}-folder-surface`}
            x1="16"
            y1="3"
            x2="94"
            y2="86"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#57565d" />
            <stop offset="0.45" stopColor="#414047" />
            <stop offset="1" stopColor="#29292e" />
          </linearGradient>
        </defs>
        <path
          d="M12 3H34C37.5 3 39.1 4.4 41.4 7.2L44.6 11.1C46 12.8 47.5 13.4 50 13.4H102C108 13.4 111 16.4 111 22.4V78C111 83 108 86 103 86H11C6 86 3 83 3 78V12C3 6 6 3 12 3Z"
          fill={`url(#${id}-folder-surface)`}
          stroke="#77757f"
          strokeOpacity="0.72"
          strokeWidth="0.8"
        />
        <path
          d="M4 15V12C4 7 7 4 12 4H34C37 4 38.5 5.3 40.6 7.8L43.8 11.7C45.3 13.5 47.2 14.4 50 14.4H102C106 14.4 109 16.2 110 20"
          stroke="#ffffff"
          strokeOpacity="0.16"
          strokeWidth="0.65"
          strokeLinecap="round"
        />
      </svg>
      <span className="folder-paper paper-one" />
      <span className="folder-paper paper-two" />
      <span className="folder-front">
        <span className="folder-emblem">↗</span>
      </span>
    </span>
  );
}
