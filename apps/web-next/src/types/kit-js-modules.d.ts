/**
 * Type bridge for the untyped Minimals kit JS modules consumed from TS files.
 *
 * TS infers unusable prop types from the kit's forwardRef/PropTypes JS
 * components (checkJs is off), so the modules TS pages import are declared
 * `any` here. IMPORTANT: when a kit component is converted to TypeScript,
 * DELETE its entry — an ambient declaration overrides the real types.
 */

declare module 'lodash/merge';

declare module 'src/components/iconify' {
  const Iconify: any;
  export default Iconify;
}

declare module 'src/components/label' {
  const Label: any;
  export default Label;
}

declare module 'src/components/scrollbar' {
  const Scrollbar: any;
  export default Scrollbar;
}

declare module 'src/components/upload' {
  export const Upload: any;
  export const UploadBox: any;
  export const UploadAvatar: any;
  export const MultiFilePreview: any;
  export const RejectionFiles: any;
  export const SingleFilePreview: any;
}

declare module 'src/components/chart' {
  const Chart: any;
  export default Chart;
  export const useChart: any;
}

declare module 'src/components/animate' {
  export const varFade: any;
  export const varZoom: any;
  export const varSlide: any;
  export const varScale: any;
  export const varBounce: any;
  export const varContainer: any;
  export const MotionLazy: any;
  export const MotionViewport: any;
  export const MotionContainer: any;
}

declare module 'src/components/hook-form' {
  const FormProvider: any;
  export default FormProvider;
  export const RHFSelect: any;
  export const RHFUpload: any;
  export const RHFSwitch: any;
  export const RHFSlider: any;
  export const RHFCheckbox: any;
  export const RHFTextField: any;
  export const RHFRadioGroup: any;
  export const RHFMultiSelect: any;
  export const RHFAutocomplete: any;
  export const RHFMultiCheckbox: any;
  export const RHFUploadAvatar: any;
  export const RHFUploadBox: any;
}

declare module 'src/components/table' {
  export const useTable: any;
  export const emptyRows: any;
  export const getComparator: any;
  export const TableNoData: any;
  export const TableSkeleton: any;
  export const TableEmptyRows: any;
  export const TableHeadCustom: any;
  export const TableSelectedAction: any;
  export const TablePaginationCustom: any;
}

declare module 'src/components/settings' {
  export const SettingsProvider: any;
  export const SettingsDrawer: any;
  export const SettingsContext: any;
  export function useSettingsContext(): any;
}

declare module 'src/components/snackbar/snackbar-provider' {
  const SnackbarProvider: any;
  export default SnackbarProvider;
}

declare module 'src/components/progress-bar' {
  const ProgressBar: any;
  export default ProgressBar;
}

declare module 'src/components/animate/motion-lazy' {
  export const MotionLazy: any;
}
