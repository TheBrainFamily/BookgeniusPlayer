import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import PlayerApp from "../../player/src/App";

type Props = { hostId?: string; hostClassName?: string; style?: React.CSSProperties };

export default function ShadowPlayer({ hostId = "player-root", hostClassName, style }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [, force] = useState(0);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });

    const cssHref = new URL("./player.css", import.meta.url).href;

    let linkEl = shadow.querySelector('link[data-player-style="true"]') as HTMLLinkElement | null;

    if (!linkEl) {
      linkEl = document.createElement("link");
      linkEl.rel = "stylesheet";
      linkEl.href = cssHref;
      linkEl.dataset.playerStyle = "true";
      shadow.appendChild(linkEl);
    } else {
      linkEl.href = cssHref;
    }

    let mount = shadow.getElementById("player-shadow-root") as HTMLDivElement | null;
    if (!mount) {
      mount = document.createElement("div");
      mount.id = "player-shadow-root";
      shadow.appendChild(mount);
    }
    mountRef.current = mount;
    force((x) => x + 1);
  }, []);

  return (
    <div ref={hostRef} id={hostId} className={hostClassName} style={style}>
      {mountRef.current ? createPortal(<PlayerApp />, mountRef.current) : null}
    </div>
  );
}
