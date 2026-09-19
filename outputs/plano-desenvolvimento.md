# Plano de desenvolvimento — proposta inicial

18/09/2026. Planejamento; nenhum ambiente ou código de aplicação provisionado.

## Premissas

Design oficial em referencia-visual-aprovada.md. Toda funcionalidade passa por comportamento, prévia UI/UX, ajustes, aprovação explícita, implementação e validação. Aprovação do design system não aprova automaticamente fluxos.

O usuário autorizou parceiros do Vercel Marketplace para centralizar a configuração e operação na Vercel. Priorizar integrações nativas, provisionamento e gestão pelo painel Vercel sempre que suportados. Isso não significa que todos os ajustes avançados dos parceiros estejam disponíveis no mesmo painel; confirmar cobertura de autenticação, recuperação e demais operações antes de selecionar os serviços. PostgreSQL Neon é a opção proposta. React, TypeScript, bibliotecas de validação, acesso a dados e testes são dependências do projeto, não serviços próprios Vercel. Autenticação e provedor Git ainda serão escolhidos; não desenvolver autenticação do zero.

## Arquitetura proposta

Next.js App Router e TypeScript; interface mobile first/PWA; backend inicial na própria aplicação via operações de servidor e endpoints. Monorepo pnpm/Turborepo com apps/web, packages/ui, packages/domain, packages/db, packages/parser, packages/config. PostgreSQL Neon via Marketplace, sujeito à confirmação. Vercel Blob apenas quando anexos forem necessários. Vercel Functions e Cron Jobs para rotinas apropriadas, com execução idempotente. IA opcional depois; regras determinísticas e revisão manual na captura desde o início.

## Ambientes

## Usuários e acesso — revisão de escopo

O usuário definiu suporte a múltiplos usuários para permitir uso pela esposa ou amigos. Isso substitui a hipótese anterior de conta única. Cada pessoa terá conta própria e dados privados: tarefas, projetos, agenda, gastos, cartões, faturas e dívidas. Compartilhar o acesso ao produto não implica compartilhar registros entre pessoas.

Proposta inicial, ainda a aprovar: acesso por convite, sem cadastro público; proprietário administra convites, sem acesso automático aos dados pessoais dos convidados. Método de login ainda não definido. Projetos ou finanças compartilhados e espaços familiares ficam fora do escopo inicial, salvo nova solicitação.

Projetar autorização no servidor para cada leitura, alteração e exportação, com vínculo dos registros ao usuário autenticado. Validar também relações entre registros, arquivos, busca, cache e rotinas em segundo plano; não confiar em user_id enviado pelo cliente. Testes com pelo menos dois usuários devem comprovar que um não acessa nem modifica dados do outro, inclusive por ID direto. Staging terá contas fictícias independentes; nunca copiar usuários, sessões ou credenciais de produção. A UI/UX de login e convite será apresentada antes da implementação.

## Isolamento de ambientes

Dois projetos Vercel para o mesmo apps/web: rotina-staging e rotina-prod. Staging com banco independente, credenciais exclusivas, dados sintéticos, identidade/test users próprios e armazenamento separado. Prod com dados reais, credenciais restritas e retenção/recuperação definidas antes do uso real. Não compartilhar contas de integração, cookies entre hosts, segredos, webhooks ou filas entre ambientes. URLs ilustrativas: staging.seudominio.com e app.seudominio.com.

Previews por mudança usam banco descartável derivado exclusivamente de fixtures ou base de teste, nunca de produção; não reutilizam banco de staging se testes concorrentes puderem interferir. Desenvolvimento local sem credenciais de produção. Guardas validam ambiente e destino do banco; scripts de reset/seed recusam produção. A interface de staging tem identificação persistente a aprovar na prévia.

O projeto rotina-staging pode usar o ambiente técnico Production da Vercel para seu endereço estável e rotinas agendadas; APP_ENV=staging distingue sua função de negócio. Não inferir acesso a dados reais a partir de VERCEL_ENV. Revisar regras de Git e deploy para que branches de teste nunca atualizem o projeto real.

## Entrega

Branch de funcionalidade → revisão e testes → preview isolada → candidato identificado por SHA em staging → validação do usuário → release controlada do mesmo SHA em prod com configuração própria → checagem de saúde. Não promover o artefato de staging com suas variáveis para produção. Alteração no código após aprovação exige novo candidato. Branch principal protegida e publicação real com autorização explícita do usuário nesta fase. Não publicar produção a cada salvamento/commit.

Registrar versão de app e migrações por release. Build, checagem de tipos, regras financeiras e testes dos fluxos afetados bloqueiam release quando falham. Catálogo visual e testes responsivos acompanham componentes compartilhados. Feature flags por ambiente permitem desligar funcionalidades novas sem excluir dados.

## Dados e recuperação

Dinheiro em centavos ou decimal exato; datas de vencimento sem conversões acidentais de fuso; horários com timezone explícito. Transações e chaves de idempotência impedem pagamentos e parcelas duplicados. Operações críticas auditáveis, com estorno/correção preservando histórico.

Migrações versionadas e executadas uma vez em etapa controlada, nunca de forma concorrente em cada build/preview. Primeiro acrescentar estrutura compatível, depois migrar e verificar dados, depois remover campos em release posterior. Testar migração e compatibilidade com a versão anterior em staging. Não usar reset no banco real.

Definir backup, retenção, janela de recuperação, RPO e RTO segundo plano do banco e custo antes de habilitar dados reais; realizar restauração de teste em banco separado. Rollback da aplicação não desfaz alterações do banco. Em incidente de dados, pausar escritas quando necessário e reconciliar registros, evitando restauração cega que apague operações posteriores.

Logs separados e sem valores sensíveis desnecessários, alertas de falhas em jobs e operações críticas, verificação pós-release com dados de teste claramente identificados e isolados. Nunca rodar teste destrutivo no usuário real.

## Sequência

1. Fechar fornecedores, autenticação, acesso, plano/custos e critérios de recuperação.
2. Planejar UI/UX de navegação e captura global; aprovar estados e versões mobile/desktop.
3. Após autorização, criar monorepo, componentes aprovados, testes e ambientes isolados.
4. Entregar tarefas, projetos e agenda em ciclos completos de prévia/aprovação/implementação.
5. Entregar gastos, contas, cartões, faturas, compras parceladas e dívidas. Tudo compõe a primeira versão utilizável acordada; implementar por etapas não retira itens do escopo.
6. Consolidar Hoje e captura entre módulos, validar restauração e liberar primeira versão real.

## Fontes oficiais consultadas

- https://vercel.com/docs/deployments/environments
- https://vercel.com/docs/postgres
- https://vercel.com/integrations/neon
- https://vercel.com/docs/instant-rollback
- https://vercel.com/docs/cron-jobs

Decisão confirmada: parceiros do Marketplace são permitidos; a prioridade é centralizar configuração e operação na Vercel. Decisões ainda abertas: autenticação, provedor Git, plano de serviços, domínio, retenção de backups e metas de recuperação. Nada contratado ou provisionado. Essa concordância não autoriza contratação ou início de implementação.
