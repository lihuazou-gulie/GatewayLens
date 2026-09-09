// Original code-drawn scenery. Coordinates stay on a pixel grid at every size.
const svg = (viewBox, body) =>
  `<svg viewBox="${viewBox}" aria-hidden="true" focusable="false" shape-rendering="crispEdges">${body}</svg>`;

export const sunArt = svg(
  "0 0 40 40",
  `
  <path fill="#ffcf6880" d="M12 0h16v4h8v8h4v16h-4v8h-8v4H12v-4H4v-8H0V12h4V4h8z"/>
  <path fill="#ffd45f" d="M12 5h16v4h4v4h4v14h-4v4h-4v4H12v-4H8v-4H4V13h4V9h4z"/>
  <path fill="#ffed8b" d="M14 8h12v4h5v16h-5v4H14v-4H9V12h5z"/>
  <path fill="#fff7bd" d="M14 10h10v4H14v8h-4V14h4z"/>`,
);

export const moonArt = svg(
  "0 0 40 40",
  `
  <path fill="#b4cde84d" d="M16 1h12v4h-8v4h-4v16h4v4h8v4h8v3h-8v3H12v-4H8v-4H4v-7H1V12h4V8h4V4h7z"/>
  <path fill="#d2e5ed" d="M16 4h8v4h-8v4h-4v12h4v5h5v4h11v3H16v-4H9v-5H5V13h4V8h7z"/>
  <path fill="#fff2cd" d="M15 6h5v2h-5v5h-4v12h4v5h8v4h-8v-4H9v-6H7V13h4V9h4z"/>
  <path fill="#a5c1d7" d="M7 18h3v4H7zm7 11h4v3h-4z"/>`,
);

export function cloudArt(variant = 0) {
  const silhouettes = [
    "M0 32h12v-8h12V12h12V4h24v8h12v12h16v-8h16v8h12v8h12v12H0z",
    "M0 32h16v-8h12v-8h20V4h28v8h12v12h20v8h20v12H0z",
    "M0 32h20V20h16v-8h24v8h16v-8h16v12h20v8h16v12H0z",
  ];
  return svg(
    "0 0 128 48",
    `
    <path fill="var(--sky-cloud-shadow)" d="${silhouettes[variant % silhouettes.length]}"/>
    <path fill="var(--sky-cloud-light)" d="${silhouettes[variant % silhouettes.length]}" transform="translate(0 -4) scale(.94 .9)"/>
    <path fill="var(--sky-cloud-shadow)" opacity=".35" d="M16 28h20v4H16zm48-8h12v4H64zm28 12h24v4H92z"/>`,
  );
}

export const houseArt = svg(
  "0 0 120 104",
  `
  <path fill="#27364d" d="M77 6h4v30h-4zM65 11h28v3H65zm5 8h17v3H70z"/>
  <path fill="#b9d9e6" d="M78 5h2v28h-2zM64 10h30v2H64z"/>
  <path fill="#e8cd83" d="M76 3h5v4h-5z"/>
  <path fill="#23364b" d="M40 26h28v5h12v5h12v5h12v7h9v10h-7v37H15V60H7V49h9v-7h8v-7h8v-5h8z"/>
  <path fill="#367dac" d="M41 31h25v5h13v5h12v5h12v7H25v-6h7v-8h9z"/>
  <path fill="#62b0d4" d="M39 31h28v5H43v6H32v8H21v5H12v-5h8v-8h10v-7h9z"/>
  <path fill="#24587f" d="M44 40h30v4H44zm-8 8h51v4H36zm-7 8h74v5H29z"/>
  <path fill="#8bc2d6" d="M20 60h47v31H20z"/>
  <path fill="#5795b8" d="M67 61h34v30H67z"/>
  <path fill="#b4dbe2" d="M22 61h43v3H22zm0 11h43v2H22zm0 11h43v2H22z"/>
  <path fill="#36759a" d="M69 71h30v3H69zm0 12h30v3H69z"/>
  <path fill="#214663" d="M39 67h18v25H39zm34 0h21v18H73zm-48 0h10v12H25z"/>
  <path fill="#6dabc2" d="M77 70h13v11H77zm-50 0h5v6h-5z"/>
  <path class="sky-window-light" fill="#ffe29b" d="M77 70h13v11H77zm-50 0h5v6h-5z"/>
  <path fill="#375d78" d="M82 68h3v15h-3zm-42 2h13v21H42z"/>
  <path fill="#82adbd" d="M43 73h7v9h-7z"/>
  <path class="sky-window-light" fill="#fcd489" d="M43 73h7v9h-7z"/>
  <path fill="#f2d08a" d="M50 85h2v2h-2z"/>
  <path fill="#a5abb0" d="M35 91h25v4H35zm-5 4h36v5H30z"/>
  <path fill="#587061" d="M12 92h20v4H12zm54 0h42v4H66z"/>
  <path fill="#7caa65" d="M8 90h8v-5h5v10H8zm92 0h5v-7h5v5h4v8h-14z"/>`,
);

function ridge(points) {
  let path = `M0 100V${points[0][1]}`;
  for (let i = 1; i < points.length; i++) {
    const [left, bottom] = points[i - 1],
      [right, top] = points[i];
    for (let x = left + 8; x <= right; x += 8) {
      const y = 4 * Math.round((bottom + ((top - bottom) * (x - left)) / (right - left)) / 4);
      path += `H${x}V${y}`;
    }
  }
  return path + "V100Z";
}
const farRidge = ridge([
  [0, 64],
  [96, 32],
  [144, 8],
  [232, 52],
  [328, 28],
  [416, 64],
  [536, 20],
  [600, 48],
  [680, 8],
  [784, 56],
  [880, 28],
  [976, 60],
  [1088, 16],
  [1200, 52],
]);
const nearRidge = ridge([
  [0, 80],
  [128, 56],
  [192, 76],
  [336, 60],
  [464, 84],
  [600, 60],
  [720, 76],
  [832, 48],
  [936, 72],
  [1040, 56],
  [1200, 76],
]);

export const hillsArt = `<svg viewBox="0 0 1200 100" preserveAspectRatio="none" aria-hidden="true" focusable="false" shape-rendering="crispEdges">
  <path fill="var(--sky-hill-far)" d="${farRidge}"/>
  <path fill="var(--sky-hill-near)" d="${nearRidge}"/>
  <path fill="var(--sky-hill-near)" opacity=".65" d="M0 91h1200v9H0z"/>
</svg>`;

export const stars = [
  [4, 14],
  [11, 39],
  [18, 12],
  [23, 54],
  [29, 28],
  [35, 8],
  [41, 46],
  [47, 21],
  [53, 6],
  [58, 52],
  [64, 29],
  [69, 11],
  [74, 47],
  [80, 23],
  [85, 8],
  [90, 42],
  [96, 19],
  [8, 62],
  [32, 65],
  [56, 68],
  [92, 67],
];
