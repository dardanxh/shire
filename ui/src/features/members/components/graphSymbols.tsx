import { type NodeRenderer, Sphere, Svg } from "reagraph";

// A filled star for repository nodes; people stay as the default sphere (a circle in 2D).
const STAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#f59e0b" stroke="#b45309" stroke-width="1" stroke-linejoin="round" d="M12 2.5l2.9 6.2 6.8.6-5.1 4.5 1.5 6.6L12 17.5 5.9 20.9l1.5-6.6-5.1-4.5 6.8-.6z"/></svg>`;
const STAR_IMAGE = `data:image/svg+xml;utf8,${encodeURIComponent(STAR_SVG)}`;

/** Repos render as stars, everyone else as reagraph's default sphere. */
export const renderGraphNode: NodeRenderer = (props) =>
  (props.node.data as { kind?: string } | undefined)?.kind === "repo" ? (
    <Svg {...props} image={STAR_IMAGE} />
  ) : (
    <Sphere {...props} />
  );
