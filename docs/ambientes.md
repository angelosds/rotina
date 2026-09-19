# Ambientes e publicação

Preparação para Vercel; os ambientes hospedados ainda precisam ser provisionados e validados.

| Recurso | Staging | Produção |
|---|---|---|
| Projeto Vercel proposto | rotina-staging | rotina-prod |
| Branch de publicação | staging | main |
| APP_ENV | staging | production |
| Banco PostgreSQL | Projeto independente, dados fictícios | Projeto independente, dados reais |
| AUTH_SECRET | Exclusivo de staging | Exclusivo de produção |
| E-mail | Chave própria, destinatários permitidos | Chave própria, domínio verificado |

Os dois projetos usam Next.js, raiz `apps/web`, Node.js 24 e acesso aos pacotes do monorepo fora da raiz. Instalação com lockfile congelado. Configure APP_URL com a URL estável de cada ambiente. A classificação Production do projeto Vercel de staging **não** muda APP_ENV=staging.

## Variáveis (somente no escopo correto de cada projeto)

- APP_ENV, APP_URL: ambiente lógico e origem HTTPS exata.
- AUTH_SECRET: segredo aleatório exclusivo, pelo menos 32 caracteres.
- DATABASE_URL: conexão PostgreSQL com TLS, fornecida pelo projeto de banco correspondente.
- EXPECTED_DATABASE_HOST: hostname esperado desse banco. Valida erro de configuração, mas não substitui a separação real dos recursos.
- RESEND_API_KEY, EMAIL_FROM: chave do provedor e remetente autorizado.
- TEST_EMAIL_ALLOWLIST: obrigatória fora de produção, lista de e-mails separados por vírgula.

Use PostgreSQL por integração do Vercel Marketplace. E-mail exige um provedor como Resend e um domínio remetente verificado para convidados externos; uma conta Gmail não é um domínio remetente configurável. Não copiar banco real para staging. Não colocar segredos de produção em previews ou builds de PRs. Previews com autenticação precisam de banco/segredos próprios e APP_URL consistente; não estão provisionados nesta etapa.

## Primeira publicação

1. Conectar GitHub e criar os dois projetos, sem publicação automática contra banco incompleto.
2. Provisionar bancos independentes, configurar variáveis e remetente.
3. Em processo administrativo com variáveis do ambiente alvo, definir MIGRATE_ENV igual a APP_ENV e executar `pnpm db:migrate`.
4. Definir BOOTSTRAP_ENV igual a APP_ENV e OWNER_EMAIL; executar `pnpm owner:create` uma única vez. O proprietário só acessa depois de comprovar o e-mail pelo link.
5. Publicar staging e validar login real, convites, mobile/desktop, expiração, revogação e permissões. Testar entrega de e-mail.
6. Promover o mesmo commit validado para main, executar migrações compatíveis em produção e publicar.

Migrações não rodam no build nem ao abrir páginas. A ferramenta registra checksum e impede alterar uma migração aplicada. Para mudanças futuras, adicionar outra migração e preferir expansão compatível antes de remoção. Antes de migração em produção, criar backup/restauração no provedor e verificar recuperação. Rollback de código não desfaz alterações no banco.

## Limites atuais

CI valida código, tipos, testes e compilação; não publica nem acessa dados reais. Isolamento de perfil e administração está implementado; cada módulo futuro deverá aplicar e testar a propriedade dos seus registros. Não há exportação, recuperação de conta assistida, revogação administrativa de membros nem envio de convites em lote nesta etapa.
