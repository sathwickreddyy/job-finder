// Exact hostname aliases only; never interpret wildcards, URLs or ports.
export function localHostAliases() {
  return (process.env.JOBOPS_LOCAL_HOSTS ?? "")
    .split(",")
    .map((hostname) => hostname.trim().toLowerCase())
    .filter((hostname) =>
      hostname.split(".").every((label) => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)),
    );
}
