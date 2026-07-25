import Typography from '@mui/material/Typography';

export function DocumentsPage() {
  return (
    <>
      <Typography variant="h2">Documents</Typography>
      <Typography color="text.secondary">
        Document drive with AI classification; rebuilt from rhub DocumentsView.tsx, FilesPanel.tsx,
        driveFolders.ts, docTypes.ts, and documentClassify.ts over the S3 storage API.
      </Typography>
    </>
  );
}
