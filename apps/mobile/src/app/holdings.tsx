import { Redirect, useLocalSearchParams } from 'expo-router';

/** `/holdings` was the Properties tab's route until 03/10/2026. Old deep links
 *  and notifications land on `/properties` with their query (q, pb) intact.
 *  It sits outside `(tabs)` so it never becomes a tab of its own. */
export default function HoldingsRedirect() {
  const params = useLocalSearchParams();
  return <Redirect href={{ pathname: '/properties', params } as never} />;
}
