/** The signed-in person's face: the sign-in provider's photo, or initials.
 *
 *  The photo is the `picture` claim of the ID token (a Google account's
 *  profile photo) and is served by the provider, not by Pattadar — nothing is
 *  copied into storage. `referrerPolicy="no-referrer"` keeps the page address
 *  out of that request. A photo that fails to load falls back to initials,
 *  and a person with no name yet gets the generic person mark rather than an
 *  empty circle. Decorative: the name beside or around it is the accessible
 *  text, so it is aria-hidden. */
import { useEffect, useState } from 'react';
import PersonOutlined from '@mui/icons-material/PersonOutlined';

import { initialsOf } from './ui';

export function Face({ picture, name, size = 'sm' }: {
  picture: string; name: string; size?: 'sm' | 'lg';
}) {
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [picture]);
  const showPhoto = !!picture && !broken;
  return (
    <span className={size === 'lg' ? 'avatarlg face' : 'face'} aria-hidden>
      {showPhoto ? (
        <img src={picture} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
      ) : name ? (
        initialsOf(name)
      ) : (
        <PersonOutlined sx={{ fontSize: size === 'lg' ? 20 : 17 }} />
      )}
    </span>
  );
}
