const bvPattern = /^BV[0-9A-Za-z]{10}$/i;
const bvTokenPattern = /BV[0-9A-Za-z]{10}/i;
const avPattern = /^(?:av)?\d+$/i;
const avTokenPattern = /(?:^|[^\w])av(\d+)(?:$|[^\w])/i;

export function classifyBilibiliQuery(keyword) {
  const value = keyword.trim();

  if (!value) {
    return {
      type: 'empty',
      value
    };
  }

  const bvToken = value.match(bvTokenPattern)?.[0];
  if (bvToken && bvPattern.test(bvToken)) {
    return {
      type: 'bv',
      value: `BV${bvToken.slice(2)}`
    };
  }

  const avToken = value.match(avTokenPattern)?.[1];
  if (avPattern.test(value) || avToken) {
    const numericValue = avToken || value.replace(/^av/i, '');
    return {
      type: 'av',
      value: `av${numericValue}`
    };
  }

  return {
    type: 'keyword',
    value
  };
}
