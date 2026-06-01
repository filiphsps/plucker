import "../../renderer/src/index.css";

import { createRoot } from "react-dom/client";
import "@fontsource/geist-mono/600.css";
import "@fontsource/geist-mono/700.css";
import themes from "./themes.json";
import { Icon, type IconTheme } from "./icon";

const params = new URLSearchParams(window.location.search);
const id = params.get("theme") ?? "dark";
const theme =
	(themes as IconTheme[]).find((t) => t.id === id) ??
	(themes as IconTheme[])[0];

createRoot(document.getElementById("root")!).render(<Icon theme={theme} />);

// Tell the screenshot driver we're done: render committed and the mono font is
// actually loaded (otherwise the capture races the font swap).
document.fonts.ready.then(() => {
	requestAnimationFrame(() => {
		requestAnimationFrame(() => {
			(window as unknown as { __ICON_READY__?: boolean }).__ICON_READY__ = true;
		});
	});
});
