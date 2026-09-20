# Ambientes e publicação

Configuração atualizada em 19/09/2026: os dois projetos Vercel e bancos Neon gratuitos foram provisionados em São Paulo. Migração inicial e proprietário foram aplicados em ambos. O domínio do Resend está verificado, cada ambiente possui sua própria chave de envio e o staging está publicado.

| Recurso | Staging | Produção |
|---|---|---|
| Projeto Vercel | rotina-staging | rotina |
| Branch de publicação | staging | main |
| APP_ENV | staging | production |
| Banco PostgreSQL | Projeto independente, dados fictícios | Projeto independente, dados reais |
| AUTH_SECRET | Exclusivo de staging | Exclusivo de produção |
| E-mail | Chave própria, destinatários permitidos | Chave própria, domínio verificado |

URLs: `https://rotina-staging.vercel.app` para validação e `https://rotina-eight-phi.vercel.app` reservada para produção. O remetente verificado é `acesso@rotina.angelosds.com`. O usuário escolheu uma conta gratuita diretamente no Resend, pois o plano gratuito foi recusado pelo Marketplace.

Os bancos foram conectados apenas ao ambiente Production do respectivo projeto Vercel. Previews automáticos estão desabilitados. O projeto de staging publica automaticamente a branch `staging`; o projeto real continua com Ignored Build Step em `exit 0`, impedindo publicação automática até a aprovação explícita da versão candidata.

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
5. Publicar staging e validar login real, convites, mobile/desktop, expiração, revogação e permissões. A publicação, a entrega e o consumo de links, a sessão do proprietário, a proteção anônima, os layouts mobile, o aceite, o primeiro acesso, a revogação de convite pendente e a separação dos papéis `owner` e `member` foram validados no ambiente hospedado. A conta convidada recebeu página não encontrada ao acessar diretamente a administração. Em 20/09/2026, a administração de membros foi publicada e validada no staging em desktop e celular: listagem, estados ativo/suspenso, confirmação antes da suspensão, reativação, encerramento seletivo de sessões e bloqueio de novos links de acesso, preservando conta e dados.
6. Promover o mesmo commit validado para main, executar migrações compatíveis em produção e publicar.

Migrações não rodam no build nem ao abrir páginas. A ferramenta registra checksum e impede alterar uma migração aplicada. Para mudanças futuras, adicionar outra migração e preferir expansão compatível antes de remoção. Antes de migração em produção, criar backup/restauração no provedor e verificar recuperação. Rollback de código não desfaz alterações no banco.

## Limites atuais

CI valida código, tipos, testes e compilação; não publica nem acessa dados reais. Isolamento de perfil e administração está implementado; cada módulo futuro deverá aplicar e testar a propriedade dos seus registros. Não há exportação, recuperação de conta assistida, exclusão administrativa de contas nem envio de convites em lote nesta etapa.
