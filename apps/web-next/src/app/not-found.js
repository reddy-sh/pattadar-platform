// Minimal boot-only 404 page for B1. The kit's real not-found.js
// (NotFoundView, from src/sections/error) is preserved at
// ../../_reference/app/not-found.js; sections/error is pruned in B1.

export const metadata = {
  title: '404 Page Not Found!',
};

export default function NotFoundPage() {
  return <p>404 — page not found.</p>;
}
