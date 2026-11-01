import next from 'eslint-config-next';

const config = [{ ignores: ['.next/**', 'dist/**', 'src/generated/**', 'next-env.d.ts'] }, ...next];

export default config;
