import { createStore } from '../src/js/data/store.js';
import { createMemoryAdapter } from './memory-adapter.js';

// A store whose clock the test controls. `env.day = '2026-11-03'` moves time; `env.hour` sets the hour.
export async function makeEnv(day = '2026-11-01') {
  const env = { day, hour: 12 };
  const date = () => {
    const [y, m, d] = env.day.split('-').map(Number);
    return new Date(y, m - 1, d, env.hour);
  };
  let n = 0;
  env.adapter = createMemoryAdapter();
  env.store = createStore({
    adapter: env.adapter,
    today: () => env.day,
    now: date,
    uuid: () => `id${++n}`,
  });
  await env.store.init();
  env.reopen = async () => {
    env.store = createStore({ adapter: env.adapter, today: () => env.day, now: date, uuid: () => `id${++n}` });
    await env.store.init();
    return env.store;
  };
  return env;
}
