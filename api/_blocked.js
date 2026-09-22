// Target for vercel.json's rewrites that keep lib/, scripts/ and
// apps-script/ from being served as static files. Those directories hold
// server-side source (no secrets — env vars aren't hardcoded in them — but
// no reason to publish internal implementation either) and local-dev-only
// tooling; only api/*.js is meant to be reachable from outside.
module.exports = (req, res) => {
  res.status(404).send('Not found');
};
