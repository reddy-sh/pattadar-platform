import { Redirect, useLocalSearchParams } from 'expo-router';

/** `/holding/[id]` was one property's route until 03/10/2026. Old deep links
 *  and notifications land on `/property/[id]` with `id` and `kind` intact. */
export default function HoldingRedirect() {
  const params = useLocalSearchParams();
  return <Redirect href={{ pathname: '/property/[id]', params } as never} />;
}
