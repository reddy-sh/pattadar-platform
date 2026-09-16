import { Navigate, useLocation } from 'react-router';

/** Keep saved map links on the same live map and filters as Properties. */
export function MapFind() {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  params.set('view', 'map');
  return <Navigate to={`/app/properties?${params}`} replace />;
}
