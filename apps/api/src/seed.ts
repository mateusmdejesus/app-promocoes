/**
 * Preenche o banco com 60 dias de histórico da loja de exemplo.
 * Uso: npm run seed -w @keropromo/api
 */
import { config } from './config';
import { openDb } from './db';
import { Repo } from './repo';
import { seedDemoHistory } from './seedDemo';

const active = await seedDemoHistory(new Repo(openDb(config.databasePath)));
console.log(`Histórico de 60 dias gerado. ${active} produtos em promoção agora.`);
