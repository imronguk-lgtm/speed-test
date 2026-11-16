#!/usr/bin/env node
// Замер скорости скачивания: 10 последовательных запросов к одному адресу.
// Запуск: node speedtest.js <url> [количество_запросов]

const DEFAULT_URL = 'https://speed.cloudflare.com/__down?bytes=10000000'; // 10 МБ
const DEFAULT_COUNT = 10;
const TIMEOUT_MS = 60_000; // на один запрос

function parseArgs(argv) {
  const url = argv[2] || DEFAULT_URL;
  const count = argv[3] ? Number(argv[3]) : DEFAULT_COUNT;

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error();
  } catch {
    console.error(`Некорректный адрес: ${url}`);
    console.error('Пример: node speedtest.js https://example.com/big-image.jpg');
    process.exit(1);
  }

  if (!Number.isInteger(count) || count < 1) {
    console.error('Количество запросов должно быть целым числом больше 0');
    process.exit(1);
  }

  return { url, count };
}

// Один запрос: ждём заголовки, затем вычитываем всё тело и считаем байты.
// Время меряем от отправки запроса до последнего полученного байта.
async function measureOnce(url) {
  // Параметр в адресе, чтобы не получить ответ из кэша. no-store — то же для fetch.
  const target = new URL(url);
  target.searchParams.set('_nocache', `${Date.now()}-${Math.random()}`);

  const start = performance.now();
  const response = await fetch(target, {
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`сервер ответил ${response.status} ${response.statusText}`.trim());
  }

  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.length;
  }
  const ms = performance.now() - start;

  return { bytes, ms };
}

function formatMB(bytes) {
  return (bytes / 1_000_000).toFixed(2);
}

async function main() {
  const { url, count } = parseArgs(process.argv);
  console.log(`Адрес: ${url}`);
  console.log(`Запросов: ${count} (последовательно)\n`);

  const results = [];
  for (let i = 1; i <= count; i++) {
    try {
      const r = await measureOnce(url);
      results.push(r);
      const mbps = (r.bytes * 8) / (r.ms / 1000) / 1_000_000;
      console.log(
        `#${String(i).padStart(2)}  ${formatMB(r.bytes)} МБ  ${r.ms.toFixed(0)} мс  ${mbps.toFixed(2)} Мбит/с`
      );
    } catch (err) {
      const reason = err.name === 'TimeoutError' ? `таймаут ${TIMEOUT_MS / 1000} с` : err.message;
      console.log(`#${String(i).padStart(2)}  ошибка: ${reason}`);
    }
  }

  if (results.length === 0) {
    console.error('\nНи один запрос не прошёл — скорость посчитать нельзя.');
    process.exit(1);
  }

  const totalBytes = results.reduce((sum, r) => sum + r.bytes, 0);
  const totalMs = results.reduce((sum, r) => sum + r.ms, 0);
  const avgMs = totalMs / results.length;
  // Скорость = все скачанные биты / всё время скачивания.
  const speedMbps = (totalBytes * 8) / (totalMs / 1000) / 1_000_000;
  const speedMBps = totalBytes / (totalMs / 1000) / 1_000_000;

  console.log('\nИтого');
  console.log(`  Успешных запросов:     ${results.length} из ${count}`);
  console.log(`  Среднее время запроса: ${avgMs.toFixed(0)} мс`);
  console.log(`  Скачано всего:         ${formatMB(totalBytes)} МБ`);
  console.log(`  Скорость скачивания:   ${speedMbps.toFixed(2)} Мбит/с (${speedMBps.toFixed(2)} МБ/с)`);
}

main();
