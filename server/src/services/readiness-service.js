export function createReadinessService({ checks = [] } = {}) {
  let acceptingTraffic = true;

  return {
    isLive() {
      return true;
    },
    isReady() {
      return acceptingTraffic;
    },
    async checkReady() {
      if (!acceptingTraffic) return { ok: false, checks: [] };
      const results = await Promise.all(
        checks.map(async ({ name, check }) => {
          try {
            return { name, ...(await check()) };
          } catch (error) {
            return { name, ok: false, errorType: error?.name || 'Error' };
          }
        }),
      );
      return { ok: results.every((result) => result.ok), checks: results };
    },
    beginDrain() {
      acceptingTraffic = false;
    },
  };
}
