# Rotina

Centralizador pessoal em desenvolvimento. Esta primeira etapa implementa acesso por convite, login por link de e-mail, nome/fuso no primeiro acesso e administração de convites pelo proprietário. Tarefas, agenda e finanças ainda não estão implementadas.

## Estrutura

- `apps/web`: Next.js App Router, rotas e experiência de acesso.
- `packages/ui`: estilos e componentes compartilhados, temas neutros claro/escuro.
- `packages/domain`: permissões, convites, perfil e limites de requisições.
- `packages/db`: Drizzle, PostgreSQL e migrações versionadas; PGlite apenas local/testes.
- `packages/config`: validação de configuração por ambiente.

Node.js 24 e pnpm 11.19.0. Turborepo coordena build e tipos. Better Auth gerencia sessões; Resend envia e-mails nos ambientes hospedados.

## Desenvolvimento local (PowerShell)

```powershell
pnpm install --frozen-lockfile
Copy-Item apps/web/.env.example apps/web/.env.local
# Preencha AUTH_SECRET com um segredo aleatório de pelo menos 32 caracteres.
$env:MIGRATE_ENV='local'
pnpm db:migrate
$env:BOOTSTRAP_ENV='local'
$env:OWNER_EMAIL='seu-email@example.com'
pnpm owner:create
pnpm dev
```

Abra http://localhost:3000. E-mails locais são arquivos privados em `.local/mail`, nunca enviados. Os links nesses arquivos dão acesso ao banco local; não publique nem compartilhe essa pasta. Pare o servidor antes de rodar scripts que abrem o mesmo banco PGlite.

```powershell
pnpm typecheck
pnpm test
pnpm build
# Com o servidor local em execução e OWNER_EMAIL definido:
node scripts/smoke-local.mjs
```

O smoke cria uma conta fictícia no banco local e encerra as sessões que usa. Aguarde um minuto entre execuções para respeitar os limites de envio.

## Publicação e processo

Veja [ambientes e publicação](docs/ambientes.md). Nenhum segredo deve entrar no Git. Staging e produção usam projetos, bancos e credenciais diferentes.

Antes de qualquer nova tela: comportamento → prévia → ajustes → aprovação explícita → implementação → validação. A referência vigente está em [outputs/referencia-visual-aprovada.md](outputs/referencia-visual-aprovada.md). As referências são protótipos; não demonstram funcionalidades já implementadas.
