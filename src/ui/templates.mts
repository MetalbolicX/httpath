import type { FileEntry } from "../types.mts";

export const getCSSStyles = (): string =>
    /*css*/ `
:root {
  --bg-page: #f2f2f2;
  --bg-article: #bbc3db;
  --color-title: #333;
  --color-paragraph: #333;
  --link-color: #1a0dab;
  --link-hover-color: #d93025;

  --toggle-color: #0f172b;
  --fill-icons: white;
}

:root:has(#dark:checked) {
  --bg-page: #333;
  --bg-article: #444;
  --color-title: #eee;
  --color-paragraph: #ddd;
  --link-color: #bb86fc;
  --link-hover-color: #ff79c6;

  --toggle-color: #0f172b;
  --fill-icons: white;
}

body {
  font-family: monospace;
  font-size: 1.3em;
  margin: 0.5em;
  padding: 1em;
  background-color: var(--bg-page);
  color: var(--color-paragraph);

  &:has(#dark:checked) {
    background-color: var(--bg-article);
    color: var(--color-title);
  }
}

h1 {
  font-size: 2em;
  margin-bottom: 0.5em;
}

a {
  text-decoration: none;
  color: var(--link-color);

  &:hover {
    text-decoration: underline;
    color: var(--link-hover-color);
  }
}

.toggle {
  --width: 3em;
  --height: calc(var(--width) / 2);
  --border-radius: calc(var(--height) / 2);

  display: inline-block;
  cursor: pointer;

  .toggle__input {
    display: none;

    &:checked + .toggle__fill {
      background: #009578;
    }

    &:checked + .toggle__fill::after {
      transform: translateX(var(--height));
    }
  }

  .toggle__fill {
    position: relative;
    width: var(--width);
    height: var(--height);
    border-radius: var(--border-radius);
    background-color: var(--toggle-color);
    transition: background-color 0.3s ease-in-out;

    &::after {
      content: "";
      position: absolute;
      top: 0;
      left: 0;
      width: var(--height);
      height: var(--height);
      border-radius: var(--border-radius);
      background-color: var(--fill-icons);
      box-shadow: 0 0 0.2em rgba(0, 0, 0, 0.2);
      transition: transform 0.3s ease-in-out;
    }
  }
}
`.trim();

export const generateDirectoryListingHTML = (
    entries: FileEntry[],
    urlPath: string,
): string => {
    const parentDir = urlPath === "/" ? "" : `<a href="../">../</a><br>`;

    const entryLinks = entries
        .sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return a.name.localeCompare(b.name);
        })
        .map((entry) => {
            const icon = entry.isDirectory ? "📁" : "📄";
            const href = entry.url === "/" ? `/${entry.name}` : `${entry.url}`;
            return `<a href="${href}">${icon} ${entry.name}</a>`;
        })
        .join("<br>");

    const themeToggle = /*html*/ `
    <label class="toggle" for="dark">
      <input type="checkbox" name="toggle" id="dark" class="toggle__input" checked>
      <span class="toggle__fill"></span>
    </label>
  `;

    return /*html*/ `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Directory listing for ${urlPath}</title>
  <style>
${getCSSStyles()}
  </style>
</head>
<body>
  ${themeToggle}
  <h1>Directory listing for ${urlPath}</h1>
  ${parentDir}
  ${entryLinks}
</body>
</html>
  `.trim();
};
