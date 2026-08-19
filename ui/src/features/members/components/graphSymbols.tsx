import { type NodeRenderer, Sphere, Svg } from "reagraph";

// A single filled star for repository nodes. IMPORTANT: reagraph's Svg symbol centers the *fill*
// mesh assuming a 50×50 viewBox (it offsets by [-25,-25] and scales by size/25) and does NOT
// reposition a stroke mesh — so the SVG must be 50×50 and FILL-ONLY (a stroke renders as a second,
// offset star). People stay as reagraph's default sphere (a circle in 2D).
const STAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50"><path fill="#f59e0b" d="M25 2 L30.6 17.9 L47.6 18.3 L34.1 28.9 L38.9 45.2 L25 35.3 L11.1 45.2 L15.9 28.9 L2.4 18.3 L19.4 17.9 Z"/></svg>`;
const STAR_IMAGE = `data:image/svg+xml;utf8,${encodeURIComponent(STAR_SVG)}`;

/** Repos render as stars, everyone else as reagraph's default sphere. */
export const renderGraphNode: NodeRenderer = (props) =>
  (props.node.data as { kind?: string } | undefined)?.kind === "repo" ? (
    <Svg {...props} image={STAR_IMAGE} />
  ) : (
    <Sphere {...props} />
  );
