import { useEffect, useMemo, useState } from 'react';
import Modal from '../components/Modal.jsx';
import { useParkingStore } from '../parking.jsx';

// Admin only: the lot's details (name, address, hourly rate) and its layout —
// add, rename and remove levels; add and remove spots. Spots with a car or a
// reservation can't be removed (the server checks this too).

const rateText = (rate) => (rate != null ? rate.toFixed(2) : '');

export default function ManageLotPage() {
  const store = useParkingStore();
  const { floors, allSpots } = store;
  const [notice, setNotice] = useState(null); // { text, error? }
  const [dialog, setDialog] = useState(null); // { type: 'addLevel' | 'addSpots' | 'rename' | 'removeLevel' | 'removeSpots', level?, codes? }
  const [picking, setPicking] = useState(null); // level code whose spots are being picked for removal
  const [picked, setPicked] = useState(() => new Set());

  const levels = useMemo(
    () =>
      floors.map((f) => {
        const spots = allSpots.filter((s) => s.level === f.code).sort((a, b) => a.number - b.number);
        return { ...f, spots, free: spots.filter((s) => s.status === 'free').length };
      }),
    [floors, allSpots]
  );

  // Runs a change, shows the result, and closes the pop-up.
  async function run(action, done) {
    try {
      const r = await action();
      setNotice({ text: done(r) });
      setDialog(null);
      return true;
    } catch (err) {
      return err.message;
    }
  }

  function startPicking(code) {
    setPicking(picking === code ? null : code);
    setPicked(new Set());
  }
  function toggle(code) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  return (
    <div className="page-stack admin">
      <header className="page-header">
        <div>
          <div className="muted small">Administration</div>
          <h1>Manage Parking Lot</h1>
          <p className="muted admin-blurb">Lot details, levels and spots.</p>
        </div>
      </header>

      <LotDetails />

      <section className="card admin-list" aria-labelledby="levels-title">
        <div className="admin-toolbar">
          <div>
            <h2 id="levels-title">Levels and spots</h2>
            <div className="muted small">
              {levels.length} {levels.length === 1 ? 'level' : 'levels'} · {allSpots.length} spots
            </div>
          </div>
          <button type="button" className="btn-primary btn-pad" onClick={() => setDialog({ type: 'addLevel' })}>
            + Add level
          </button>
        </div>

        {notice && (
          <div className={`admin-notice${notice.error ? ' is-error' : ''}`} role={notice.error ? 'alert' : 'status'}>
            <span>{notice.text}</span>
            <button type="button" className="notice-close" aria-label="Dismiss" onClick={() => setNotice(null)}>
              ×
            </button>
          </div>
        )}

        <ul className="level-list">
          {levels.map((lv) => {
            const inUse = lv.spots.length - lv.free;
            const isPicking = picking === lv.code;
            return (
              <li key={lv.code} className="level-item">
                <div className="level-row">
                  <div className="level-info">
                    <div className="level-title">
                      <strong>{lv.name}</strong> <span className="mono muted small">{lv.code}</span>
                    </div>
                    <div className="muted small">
                      {lv.spots.length} spots · {lv.free} open · {inUse} in use
                    </div>
                  </div>
                  <div className="level-actions">
                    <button type="button" className="btn-outline btn-sm" onClick={() => setDialog({ type: 'rename', level: lv })}>
                      Rename
                    </button>
                    <button type="button" className="btn-outline btn-sm" onClick={() => setDialog({ type: 'addSpots', level: lv })}>
                      Add spots
                    </button>
                    <button type="button" className="btn-outline btn-sm" aria-expanded={isPicking} onClick={() => startPicking(lv.code)}>
                      {isPicking ? 'Done' : 'Remove spots'}
                    </button>
                    <button
                      type="button"
                      className="btn-outline btn-sm btn-outline-danger"
                      disabled={levels.length <= 1}
                      title={levels.length <= 1 ? 'The lot needs at least one level.' : undefined}
                      onClick={() => setDialog({ type: 'removeLevel', level: lv })}
                    >
                      Remove level
                    </button>
                  </div>
                </div>

                {isPicking && (
                  <div className="spot-picker">
                    <p className="muted small" style={{ margin: 0 }}>
                      Choose the spots to remove. Spots with a car or reservation can't be removed.
                    </p>
                    <div className="picker-grid" role="group" aria-label={`Spots on ${lv.name}`}>
                      {lv.spots.map((s) => {
                        const busy = s.status !== 'free';
                        return (
                          <button
                            key={s.id}
                            type="button"
                            className={`picker-spot${picked.has(s.id) ? ' is-picked' : ''}${busy ? ' is-busy' : ''}`}
                            disabled={busy}
                            aria-pressed={picked.has(s.id)}
                            aria-label={`${s.id}${busy ? `, ${s.status}` : ''}`}
                            title={busy ? `${s.id} is ${s.status}` : s.id}
                            onClick={() => toggle(s.id)}
                          >
                            {String(s.number).padStart(2, '0')}
                          </button>
                        );
                      })}
                    </div>
                    <div className="picker-actions">
                      <button type="button" className="btn-inline" onClick={() => setPicked(new Set(lv.spots.filter((s) => s.status === 'free').map((s) => s.id)))}>
                        Select all open
                      </button>
                      <button type="button" className="btn-inline" onClick={() => setPicked(new Set())}>
                        Clear
                      </button>
                      <button
                        type="button"
                        className="btn-danger btn-pad"
                        disabled={!picked.size}
                        onClick={() => setDialog({ type: 'removeSpots', level: lv, codes: [...picked] })}
                      >
                        Remove {picked.size || ''} {picked.size === 1 ? 'spot' : 'spots'}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <AddLevelDialog
        open={dialog?.type === 'addLevel'}
        nextNumber={levels.length + 1}
        onClose={() => setDialog(null)}
        onSave={(name, spots) => run(() => store.addLevel(name, spots), (r) => `${r.name} added with ${r.spots} spots.`)}
      />
      <NumberDialog
        open={dialog?.type === 'addSpots'}
        title={`Add spots · ${dialog?.level?.name ?? ''}`}
        label="Number of spots to add"
        hint="New spots fill any gaps in the numbering first, then continue after the last spot."
        confirm={(n) => `Add ${n} ${n === 1 ? 'spot' : 'spots'}`}
        onClose={() => setDialog(null)}
        onSave={(n) =>
          run(
            () => store.addSpots(dialog.level.code, n),
            (r) => `Added ${r.added.length} ${r.added.length === 1 ? 'spot' : 'spots'} to ${dialog.level.name}: ${r.added.length > 6 ? `${r.added[0]} … ${r.added.at(-1)}` : r.added.join(', ')}.`
          )
        }
      />
      <RenameDialog
        level={dialog?.type === 'rename' ? dialog.level : null}
        onClose={() => setDialog(null)}
        onSave={(name) => run(() => store.renameLevel(dialog.level.code, name), (r) => `${dialog.level.name} renamed to ${r.name}.`)}
      />
      <ConfirmDialog
        open={dialog?.type === 'removeLevel'}
        title={`Remove ${dialog?.level?.name ?? 'level'}?`}
        confirm="Yes, remove level"
        onClose={() => setDialog(null)}
        onConfirm={() =>
          run(() => store.removeLevel(dialog.level.code), (r) => `${dialog.level.name} removed (${r.removedSpots} spots).`).then((ok) => {
            if (ok === true && picking === dialog.level.code) setPicking(null);
            return ok;
          })
        }
      >
        {dialog?.level && (
          <>
            <p style={{ margin: 0 }}>
              All {dialog.level.spots.length} spots on {dialog.level.name} are removed. Customers can no longer park or reserve there.
            </p>
            {dialog.level.spots.length - dialog.level.free > 0 ? (
              <p className="confirm-warning" style={{ margin: 0 }}>
                {dialog.level.spots.length - dialog.level.free} spots on this level have a car or reservation. Check them out or cancel them first.
              </p>
            ) : (
              <p className="muted small" style={{ margin: 0 }}>
                Past reservations and payments are kept. Adding a level later reuses the code {dialog.level.code}.
              </p>
            )}
          </>
        )}
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog?.type === 'removeSpots'}
        title={`Remove ${dialog?.codes?.length ?? 0} ${dialog?.codes?.length === 1 ? 'spot' : 'spots'}?`}
        confirm="Yes, remove"
        onClose={() => setDialog(null)}
        onConfirm={() =>
          run(() => store.removeSpots(dialog.codes), (r) => `Removed ${r.removed.length} ${r.removed.length === 1 ? 'spot' : 'spots'} from ${dialog.level.name}.`).then((ok) => {
            if (ok === true) setPicked(new Set());
            return ok;
          })
        }
      >
        {dialog?.codes && (
          <>
            <p style={{ margin: 0 }}>
              From {dialog.level.name}: <span className="mono">{dialog.codes.length > 12 ? `${dialog.codes.slice(0, 12).join(', ')} …` : dialog.codes.join(', ')}</span>
            </p>
            <p className="muted small" style={{ margin: 0 }}>
              They disappear from the spot map. Adding spots to this level later brings these numbers back first.
            </p>
          </>
        )}
      </ConfirmDialog>
    </div>
  );
}

// Lot name, address and hourly rate (moved here from Settings).
function LotDetails() {
  const { hourlyRate, lotName, address, setLotSettings } = useParkingStore();
  const [lot, setLot] = useState({ lotName, address, rate: rateText(hourlyRate) });
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => {
    setLot((l) => ({ ...l, [k]: e.target.value }));
    setStatus('');
    setError('');
  };

  async function save(e) {
    e.preventDefault();
    const changes = {};
    if (lot.lotName.trim() !== lotName) changes.lotName = lot.lotName.trim();
    if (lot.address.trim() !== address) changes.address = lot.address.trim();
    if (lot.rate.trim() !== rateText(hourlyRate)) changes.hourlyRate = lot.rate.trim() || null;
    if (!Object.keys(changes).length) return setStatus('No changes to save.');
    setBusy(true);
    try {
      const saved = await setLotSettings(changes);
      setLot({ lotName: saved.lotName, address: saved.address, rate: rateText(saved.hourlyRate) });
      setStatus('Lot details saved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card form-card" onSubmit={save} noValidate aria-labelledby="lot-title">
      <h2 id="lot-title">Lot details</h2>
      <p className="muted small" style={{ margin: 0 }}>
        Shown to every customer. The hourly rate applies to new reservations; existing ones keep their price.
      </p>
      <div className="form-grid">
        <label className="form-field">
          <span>Lot name</span>
          <input type="text" maxLength={100} value={lot.lotName} onChange={set('lotName')} />
        </label>
        <label className="form-field">
          <span>Address</span>
          <input type="text" maxLength={200} value={lot.address} onChange={set('address')} />
        </label>
        <label className="form-field">
          <span>Hourly rate ($)</span>
          <input type="text" inputMode="decimal" placeholder="e.g. 3.50" value={lot.rate} aria-describedby="rate-hint" onChange={set('rate')} />
          <span id="rate-hint" className="muted small field-hint">
            Leave empty to clear it.
          </span>
        </label>
      </div>
      <div className="form-actions">
        {error && (
          <span className="field-error" role="alert">
            {error}
          </span>
        )}
        {status && (
          <span className="form-ok" role="status">
            {status}
          </span>
        )}
        <button type="submit" className="btn-primary btn-pad" disabled={busy}>
          {busy ? 'Saving…' : 'Save lot details'}
        </button>
      </div>
    </form>
  );
}

// Shared pop-up shell: shows the server's error and keeps the pop-up open on failure.
function useSubmit(onSave) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(...args) {
    setBusy(true);
    setError('');
    const ok = await onSave(...args);
    setBusy(false);
    if (ok !== true) setError(ok || 'Something went wrong.');
  }
  return { busy, error, setError, submit };
}

function ErrorLine({ error }) {
  return error ? (
    <div className="field-error" role="alert">
      {error}
    </div>
  ) : null;
}

function AddLevelDialog({ open, nextNumber, onClose, onSave }) {
  const [name, setName] = useState('');
  const [spots, setSpots] = useState('24');
  const { busy, error, setError, submit } = useSubmit(onSave);
  useEffect(() => {
    if (open) {
      setName('');
      setSpots('24');
      setError('');
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const close = () => {
    if (busy) return;
    setError('');
    onClose();
  };
  return (
    <Modal open={open} title="Add a level" onClose={close}>
      <form
        className="auth-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const n = Number(spots);
          if (!Number.isInteger(n) || n < 1 || n > 100) return setError('Enter a number of spots from 1 to 100.');
          submit(name.trim(), n);
        }}
      >
        <label className="form-field">
          <span>Name</span>
          <input type="text" maxLength={60} placeholder={`Level ${nextNumber}`} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <span className="muted small field-hint">Optional, e.g. Rooftop. Leave empty for “Level {nextNumber}”.</span>
        </label>
        <label className="form-field">
          <span>Number of spots</span>
          <input type="number" min={1} max={100} value={spots} onChange={(e) => setSpots(e.target.value)} />
          <span className="muted small field-hint">1 to 100. You can add more later.</span>
        </label>
        <ErrorLine error={error} />
        <div className="confirm-actions">
          <button type="submit" className="btn-primary btn-pad" disabled={busy}>
            {busy ? 'Adding…' : 'Add level'}
          </button>
          <button type="button" className="btn-outline btn-pad" disabled={busy} onClick={close}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}

function NumberDialog({ open, title, label, hint, confirm, onClose, onSave }) {
  const [value, setValue] = useState('1');
  const { busy, error, setError, submit } = useSubmit(onSave);
  const n = Number(value);
  useEffect(() => {
    if (open) {
      setValue('1');
      setError('');
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const close = () => {
    if (busy) return;
    setError('');
    onClose();
  };
  return (
    <Modal open={open} title={title} onClose={close}>
      <form
        className="auth-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!Number.isInteger(n) || n < 1 || n > 100) return setError('Enter a number from 1 to 100.');
          submit(n);
        }}
      >
        <label className="form-field">
          <span>{label}</span>
          <input type="number" min={1} max={100} value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
          <span className="muted small field-hint">{hint}</span>
        </label>
        <ErrorLine error={error} />
        <div className="confirm-actions">
          <button type="submit" className="btn-primary btn-pad" disabled={busy}>
            {busy ? 'Saving…' : confirm(Number.isInteger(n) && n > 0 ? n : 1)}
          </button>
          <button type="button" className="btn-outline btn-pad" disabled={busy} onClick={close}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}

function RenameDialog({ level, onClose, onSave }) {
  const [name, setName] = useState('');
  const [forCode, setForCode] = useState(null);
  const { busy, error, setError, submit } = useSubmit(onSave);
  if (level && forCode !== level.code) {
    setForCode(level.code);
    setName(level.name);
    setError('');
  }
  const close = () => {
    if (busy) return;
    setForCode(null);
    onClose();
  };
  return (
    <Modal open={Boolean(level)} title={`Rename ${level?.name ?? 'level'}`} onClose={close}>
      <form
        className="auth-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return setError('Enter a name for the level.');
          submit(name.trim()).then(() => setForCode(null));
        }}
      >
        <label className="form-field">
          <span>Name</span>
          <input type="text" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <span className="muted small field-hint">Spot codes ({level?.code}-01, …) stay the same.</span>
        </label>
        <ErrorLine error={error} />
        <div className="confirm-actions">
          <button type="submit" className="btn-primary btn-pad" disabled={busy}>
            {busy ? 'Saving…' : 'Save name'}
          </button>
          <button type="button" className="btn-outline btn-pad" disabled={busy} onClick={close}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ConfirmDialog({ open, title, confirm, onClose, onConfirm, children }) {
  const { busy, error, setError, submit } = useSubmit(onConfirm);
  const close = () => {
    if (busy) return;
    setError('');
    onClose();
  };
  return (
    <Modal open={open} title={title} onClose={close}>
      {children}
      <ErrorLine error={error} />
      <div className="confirm-actions">
        <button type="button" className="btn-danger btn-pad" disabled={busy} onClick={() => submit()}>
          {busy ? 'Removing…' : confirm}
        </button>
        <button type="button" className="btn-outline btn-pad" disabled={busy} onClick={close}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}
