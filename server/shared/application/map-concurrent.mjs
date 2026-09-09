export async function mapConcurrent(items, concurrency, worker, signal) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length) {
        signal?.throwIfAborted();
        const index = next++;
        results[index] = await worker(items[index]);
      }
    }),
  );
  return results;
}
