/**
 * Conecta o keropromo ao Mercado Livre (uma vez só).
 *
 * Uso: npm run ml:connect -w @keropromo/api -- CODIGO_DE_AUTORIZACAO
 *
 * Variáveis necessárias: ML_CLIENT_ID, ML_CLIENT_SECRET e ML_REDIRECT_URI (a mesma URL
 * cadastrada no aplicativo). Imprime o refresh token: coloque-o no Railway como ML_REFRESH_TOKEN.
 */
import { exchangeAuthorizationCode } from './mercadolivreAuth';

const code = process.argv[2];
const clientId = process.env.ML_CLIENT_ID ?? '';
const clientSecret = process.env.ML_CLIENT_SECRET ?? '';
const redirectUri = process.env.ML_REDIRECT_URI ?? 'https://app-promocoes-production.up.railway.app/';

if (!code || !clientId || !clientSecret) {
  console.error('Faltam o código de autorização (argumento) e ML_CLIENT_ID / ML_CLIENT_SECRET.');
  process.exit(1);
}

const { refreshToken } = await exchangeAuthorizationCode({ clientId, clientSecret, code, redirectUri });
console.log('Conectado. Coloque este valor no Railway como ML_REFRESH_TOKEN (não compartilhe):');
console.log(refreshToken);
