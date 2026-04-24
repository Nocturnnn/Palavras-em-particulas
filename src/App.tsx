import { useDeferredValue, useState } from 'react';
import { ParticleText } from './components/ParticleText';

const MAX_CHARACTERS = 16;
const DEFAULT_WORD = 'REACT';

function App() {
  const [value, setValue] = useState('');

  const trimmedValue = value.trim();
  const displayWord = trimmedValue ? trimmedValue.slice(0, MAX_CHARACTERS) : DEFAULT_WORD;
  const deferredWord = useDeferredValue(displayWord);

  return (
    <div className="app-shell">
      <header className="control-bar">
        <label className="input-wrap" htmlFor="particle-word">
          <span className="sr-only">Digite uma palavra</span>
          <input
            id="particle-word"
            type="text"
            maxLength={MAX_CHARACTERS}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Digite uma palavra..."
            autoComplete="off"
            spellCheck={false}
          />
        </label>
      </header>

      <main className="canvas-shell">
        <ParticleText text={deferredWord} />
      </main>
    </div>
  );
}

export default App;
