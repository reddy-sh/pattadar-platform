// Hand-written types for the kit's plain-JS EmptyContent (empty-content.js):
// unlike most kept kit components it isn't wrapped in forwardRef, so tsc's
// allowJs inference on its destructured params treats every prop as
// required. TS prefers a co-located .d.ts over the .js file's own inferred
// type, so every B5 route-skeleton stub (`<EmptyContent title=.. filled />`)
// can pass just the props it needs.
import type { ReactNode } from 'react';
import type { SxProps, Theme } from '@mui/material/styles';

export interface EmptyContentProps {
  title?: string;
  description?: string;
  imgUrl?: string;
  action?: ReactNode;
  filled?: boolean;
  sx?: SxProps<Theme>;
}

declare const EmptyContent: (props: EmptyContentProps) => JSX.Element;
export default EmptyContent;
