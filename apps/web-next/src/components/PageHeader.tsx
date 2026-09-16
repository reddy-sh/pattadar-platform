import type { ElementType, ReactNode } from 'react';

import { PageHeader as KitPageHeader } from './kit/PageHeader';

interface PageHeaderProps {
  title: string;
  /** Overline eyebrow above the title (M3 label style). */
  eyebrow?: string;
  subtitle?: string;
  /**
   * Shown when the view is rendering the bundled sample dataset.
   *
   * The name always lied: the chip it renders says "Service unreachable". It
   * is forwarded to the kit's honest `dataState="unreachable"`.
   */
  sample?: boolean;
  /** Small chips inline with the title (counts etc.). */
  titleChips?: ReactNode;
  /** Right-aligned actions (buttons, toggles). */
  actions?: ReactNode;
  /**
   * Heading element. Pages own exactly ONE `<h1>` (the default); in-page
   * section scaffolds pass 'h2'/'h3' with the smaller variant.
   */
  component?: ElementType;
  /** Visual size — 'h2' page headline (h4 scale) or 'h3' section title (h6 scale). */
  variant?: 'h2' | 'h3';
}

/**
 * @deprecated Use `PageHeader` from `src/components/kit` instead.
 *
 * This is a compatibility shim, not a component: it forwards to the kit's
 * `PageHeader`, mapping `variant: 'h2' | 'h3'` onto `level: 'page' | 'section'`
 * and `sample: true` onto `dataState: 'unreachable'`. Twelve call sites keep
 * compiling and rendering as they did while screens migrate one at a time; the
 * file is deleted in the final cleanup step, not the first.
 *
 * Nothing new should import it. The kit component carries the props this one
 * cannot express — a `ReactNode` subtitle, `back`, `breadcrumbs`, `media`,
 * `status` and the `below` slot that owns the header → controls → content
 * rhythm.
 */
export function PageHeader({
  title,
  eyebrow,
  subtitle,
  sample,
  titleChips,
  actions,
  component = 'h1',
  variant = 'h2',
}: PageHeaderProps) {
  return (
    <KitPageHeader
      title={title}
      eyebrow={eyebrow}
      subtitle={subtitle}
      dataState={sample ? 'unreachable' : undefined}
      titleChips={titleChips}
      actions={actions}
      component={component}
      level={variant === 'h2' ? 'page' : 'section'}
    />
  );
}
