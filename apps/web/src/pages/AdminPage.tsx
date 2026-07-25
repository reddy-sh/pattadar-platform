import Typography from '@mui/material/Typography';

export function AdminPage() {
  return (
    <>
      <Typography variant="h2">Admin</Typography>
      <Typography color="text.secondary">
        Reference-data and app administration; rebuilt from rhub AdminView in RemoteApp.tsx,
        plus super-admin AI/model settings served by the gateway.
      </Typography>
    </>
  );
}
