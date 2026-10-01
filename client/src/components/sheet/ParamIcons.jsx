// Small icons before the labels of the sheet's parameters: Movement (footsteps), Size (a square growing in its corners)
// and Experience Modifier (a star). Plain outlines in the text colour.
const base = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };

function Icon({ id, children }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" className="mr-1 inline-block shrink-0 align-[-3px] opacity-70" aria-hidden="true" data-testid={`icon-${id}`}>
      {children}
    </svg>
  );
}

export const MovementIcon = () => (
  <Icon id="movement">
    <path d="M7.5 3.5c-1.8 0-2.8 2.2-2.8 4.4 0 1.8.8 2.8 2 2.8s2-1 2-2.8c0-2.2-.4-4.4-1.2-4.4z" {...base} />
    <path d="M6.6 13.2h2.2v1.6c0 .8-.5 1.4-1.1 1.4s-1.1-.6-1.1-1.4z" {...base} />
    <path d="M16.5 8.5c-1.8 0-2.8 2.2-2.8 4.4 0 1.8.8 2.8 2 2.8s2-1 2-2.8c0-2.2-.4-4.4-1.2-4.4z" {...base} />
    <path d="M15.6 18.2h2.2v1.6c0 .8-.5 1.4-1.1 1.4s-1.1-.6-1.1-1.4z" {...base} />
  </Icon>
);

export const SizeIcon = () => (
  <Icon id="size">
    <rect x="8" y="8" width="8" height="8" rx="1" {...base} />
    <path d="M3.5 8.5v-5h5M20.5 8.5v-5h-5M3.5 15.5v5h5M20.5 15.5v5h-5" {...base} />
  </Icon>
);

export const ExperienceIcon = () => (
  <Icon id="experience">
    <path d="M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 16.9l-5.4 2.9 1.1-6.1L3.2 9.4l6.1-.8z" {...base} />
  </Icon>
);
