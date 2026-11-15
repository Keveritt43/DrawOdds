export function selectedValues(params: Pick<URLSearchParams, 'getAll'>, key: string, fallback = ''): string[] {
  const values = params.getAll(key);
  return (values.length ? values : [fallback]).flatMap(value => value.split(',')).filter(value => !!value && value !== 'ALL');
}
