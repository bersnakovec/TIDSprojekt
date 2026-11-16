// RiftVault – Naloga 4 frontend: form → POST /api/advice → render DeckAdvice.
// Everything coming from the model is escaped before it is put into the page.

const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = (v) => (v == null ? '–' : new Intl.NumberFormat('sl-SI', { style: 'currency', currency: 'EUR' }).format(v));
const DIFFICULTY = { easy: 'lahek za igranje', medium: 'srednje zahteven', hard: 'zahteven' };

let source = 'list';

async function api(path, options) {
  const res = await fetch(path, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

// ---------- form setup ----------

async function init() {
  const data = await api('/api/decks');
  const badge = $('#model-badge');
  badge.textContent = data.mock ? 'Testni način – brez API ključa (vzorčni odgovor)' : `Model: ${data.model}`;
  badge.classList.toggle('mock', data.mock);

  // deck picker grouped by event
  const byEvent = Map.groupBy(data.decks, (d) => `${d.event} (${d.date})`);
  const select = $('#deck');
  for (const [event, decks] of byEvent) {
    const group = document.createElement('optgroup');
    group.label = event;
    for (const d of decks) {
      group.append(new Option(`${d.player} – ${d.legend.replace(/,.*$/, '')}${d.rank ? ` (${d.rank})` : ''}`, d.id));
    }
    select.append(group);
  }
  select.addEventListener('change', showDeck);
  showDeck();

  document.querySelectorAll('[data-source]').forEach((b) => b.addEventListener('click', () => {
    source = b.dataset.source;
    document.querySelectorAll('[data-source]').forEach((x) => x.setAttribute('aria-pressed', x === b));
    $('#source-list').hidden = source !== 'list';
    $('#source-text').hidden = source !== 'text';
  }));

  const budget = $('#budget');
  budget.addEventListener('input', () => { $('#budget-out').textContent = `${budget.value} €`; });

  $('#form').addEventListener('submit', submit);
}

async function showDeck() {
  const box = $('#deck-preview');
  box.textContent = 'Nalagam deck …';
  try {
    const d = await api(`/api/deck?id=${encodeURIComponent($('#deck').value)}`);
    box.innerHTML = `
      <span>Legenda: <strong>${esc(d.legend)}</strong> · ${esc(d.domains.join(' / '))}</span>
      <span>${d.counts.mainDeck} kart v glavnem decku · vrednost <strong>${eur(d.totalEur)}</strong></span>
      <span>${d.poolSize} kart v naboru za zamenjave</span>`;
  } catch (err) {
    box.textContent = err.message;
  }
}

function readForm() {
  const f = new FormData($('#form'));
  return {
    deckId: source === 'list' ? f.get('deckId') : null,
    deckText: source === 'text' ? f.get('deckText') : null,
    budgetEur: Number(f.get('budgetEur')),
    swapCount: Number(f.get('swapCount')),
    experience: f.get('experience'),
    goal: f.get('goal'),
    language: f.get('language'),
    styles: f.getAll('styles'),
    notes: f.get('notes'),
  };
}

async function submit(e) {
  e.preventDefault();
  const input = readForm();
  const err = $('#form-error');
  err.hidden = true;
  if (source === 'text' && !input.deckText?.trim()) {
    err.textContent = 'Prilepi seznam kart.';
    err.hidden = false;
    return;
  }

  const btn = $('#submit');
  btn.disabled = true;
  btn.textContent = 'Analiziram …';
  $('#result').innerHTML = `<div class="panel loading"><div class="spinner"></div>
    Model analizira deck … to običajno traja 5–30 sekund.</div>`;
  try {
    const data = await api('/api/advice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    render(data);
  } catch (error) {
    $('#result').innerHTML = `<div class="panel"><p class="error">Napaka: ${esc(error.message)}</p></div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Analiziraj deck';
  }
}

// ---------- rendering ----------

function stars(n) {
  return `<span class="stars" aria-label="${n} od 5">${'★'.repeat(n)}<span class="off">${'★'.repeat(5 - n)}</span></span>`;
}

function render({ advice: a, deck, llm, prompt, rawJson }) {
  const swaps = a.swaps.map((s) => `
    <div class="swap ${s.isValid ? '' : 'invalid'}">
      <div class="swap-line">
        <span class="out">${s.quantity}× ${esc(s.remove)}</span>
        <span class="arrow" aria-hidden="true">→</span>
        <span>${s.quantity}× ${esc(s.add)}</span>
        <span class="price">${s.cost == null ? 'cena ni znana' : `${eur(s.cost)} <small>(${eur(s.priceEach)}/kos)</small>`}</span>
      </div>
      <p class="why">${esc(s.reason)}</p>
      ${s.addCard ? `<p class="card-text"><b>${esc(s.addCard.type)} · ${esc(s.addCard.domains.join('/'))}</b>${s.addCard.text ? `: ${esc(s.addCard.text)}` : ''}</p>` : ''}
      ${s.issues.map((i) => `<p class="issue">⚠ ${esc(i)}</p>`).join('')}
    </div>`).join('');

  const usage = llm.usage
    ? `<span>vhod ${llm.usage.input_tokens} tok.</span><span>izhod ${llm.usage.output_tokens} tok.</span>`
    : '';
  const cost = llm.costUsd != null ? `<span>cena ≈ ${llm.costUsd.toFixed(4)} $</span>` : '';

  $('#result').innerHTML = `
    <article class="panel">
      <div class="hero-head">
        <h2>${esc(a.archetype)}</h2>
        <span class="tag">${esc(DIFFICULTY[a.difficulty])}</span>
      </div>
      <p class="sub">${esc(deck.title)} · ${esc(deck.legend)} · vrednost decka ${eur(deck.totalEur)}</p>
      ${deck.unknown.length ? `<p class="issue">⚠ Neznane karte v seznamu: ${esc(deck.unknown.join(', '))}</p>` : ''}
      <p class="summary">${esc(a.summary)}</p>
      <p class="plan"><b>Načrt igre:</b> ${esc(a.gamePlan)}</p>
    </article>

    <div class="two">
      <section class="panel"><h3>Prednosti</h3><ul class="clean pro">${a.strengths.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></section>
      <section class="panel"><h3>Slabosti</h3><ul class="clean con">${a.weaknesses.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></section>
    </div>

    <section class="panel">
      <h2>Predlagane zamenjave <span class="tag">${a.validSwapCount}/${a.swaps.length} veljavnih</span></h2>
      <div class="swaps">${swaps || '<p>Model ni predlagal zamenjav.</p>'}</div>
      <div class="budget-bar">
        <span>Skupaj za nove karte: <b>${eur(a.swapCost)}</b> od ${eur(a.budgetEur)}</span>
        <span class="${a.withinBudget ? 'ok' : 'over'}">${a.withinBudget ? '✓ v okviru proračuna' : '✕ presega proračun'}</span>
      </div>
      <p class="why" style="margin-top:8px">${esc(a.budgetComment)}</p>
    </section>

    <div class="two">
      <section class="panel">
        <h3>Ključne karte</h3>
        <div class="keycards">${a.keyCards.map((k) => `<div><b>${esc(k.name)}</b>${k.inDeck ? '' : ' <span class="issue">⚠ ni v decku</span>'}<br><span>${esc(k.role)}</span></div>`).join('')}</div>
      </section>
      <section class="panel">
        <h3>Mulligan</h3>
        <ul class="clean">${a.mulligan.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>
      </section>
    </div>

    <section class="panel">
      <h3>Matchupi</h3>
      <table class="matchups"><tbody>
        ${a.matchups.map((m) => `<tr><td>${esc(m.opponent)}</td><td>${stars(m.rating)}</td><td>${esc(m.tip)}</td></tr>`).join('')}
      </tbody></table>
    </section>

    <section class="panel">
      <h3>Pod pokrovom</h3>
      <div class="meta"><span>model ${esc(llm.model)}</span>${usage}${cost}<span>${(llm.ms / 1000).toFixed(1)} s</span></div>
      <details><summary>Prompt, poslan modelu (${prompt.user.length.toLocaleString('sl-SI')} znakov)</summary>
        <pre>${esc(`[SYSTEM]\n${prompt.system}\n\n[USER]\n${prompt.user}`)}</pre></details>
      <details><summary>Surovi JSON odgovor</summary><pre>${esc(JSON.stringify(JSON.parse(rawJson), null, 2))}</pre></details>
    </section>`;
  $('#result').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

init().catch((err) => {
  $('#result').innerHTML = `<div class="panel"><p class="error">Napaka pri nalaganju: ${esc(err.message)}</p></div>`;
});
