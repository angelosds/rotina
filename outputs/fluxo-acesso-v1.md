# Convite, login e primeiro acesso — proposta 1

18/09/2026 · Para aprovação de UI/UX. Nenhuma autenticação, conta ou mensagem real criada.

## Proposta

Login por link enviado ao e-mail, sem senha. Método ainda não escolhido pelo usuário; esta prévia propõe link por e-mail por funcionar para convidados sem exigir conta Google. Fornecedor será validado depois da aprovação da experiência e antes da implementação. Uma troca de método que altere a experiência exige nova prévia.

Somente o proprietário pode convidar na primeira versão. Convidados recebem área pessoal privada, com os mesmos módulos. Administrar convites não concede leitura dos registros de outros usuários. Não há compartilhamento de tarefas ou finanças nesta etapa.

## Jornada do proprietário

Configurações → Pessoas e convites → informar e-mail → Enviar convite → registro Pendente com data de expiração. Mostrar uma mensagem clara de que o convidado terá conta própria. Proposta: convite válido por 7 dias, revogável enquanto não aceito; reenviar invalida o anterior. Convidado existente não recebe conta duplicada. Revogar convite não exclui conta existente nem seus dados. Primeiro proprietário provisionado de forma controlada, sem cadastro público.

## Jornada do convidado

E-mail de convite → abrir link → ver quem convidou e e-mail destinatário → confirmar aceite → preencher nome e revisar fuso → abrir Hoje vazio. O token comprova acesso ao e-mail; se expirar antes do aceite, solicitar novo convite ao proprietário. Navegação GET não consome token, evitando aceite automático por scanner de e-mail. Se houver sessão de outra conta, pedir troca antes de aceitar. Proposta de validade será ajustada à capacidade do provedor.

## Retorno

Entrar → informar e-mail → resposta neutra “Se este e-mail tiver acesso, você receberá um link para entrar” → abrir link → confirmar entrada → Hoje. Link de login de uso único, validade proposta de 15 minutos, distinta do convite de 7 dias. Reenvio com limite e indicação de espera. Não revelar existência de conta a visitantes; convidado não autenticado não pode consultar lista de usuários.

## Primeira configuração

Nome, fuso com sugestão do dispositivo e opção de revisão; BRL e pt-BR como defaults desta primeira versão. Tema segue Sistema; configuração posterior permite Claro/Escuro/Sistema. Não exigir cadastro financeiro inicial. Hoje começa vazio com ação de primeiro registro. Não importar registros de quem convidou.

## Estados obrigatórios

| Situação | Experiência |
|---|---|
| E-mail inválido | Mensagem junto do campo, valor preservado |
| Envio em andamento | Botão “Enviando…” sem submissão duplicada |
| Envio falha | Mensagem com tentar novamente, preservando e-mail |
| Link solicitado | Resposta neutra e opção de corrigir e-mail |
| Login expirado/usado | Voltar e solicitar novo link |
| Convite expirado/revogado | Explicar indisponibilidade e orientar contato com quem convidou |
| Conta diferente autenticada | Mostrar conta atual e opção de trocar; não aceitar silenciosamente |
| Aceite já feito | Direcionar ao login, sem criar segunda conta |
| Muitos envios | Mostrar tempo restante; não ficar tentando automaticamente |
| Sem convites (proprietário) | Estado vazio com formulário de convite |
| Primeiro acesso concluído | Hoje vazio com primeira ação |

## Layout e revisão

Mobile: card de formulário em uma coluna, margens de 16 px e alvos 44 px. Desktop: mesmo formulário centralizado, máximo 440 px; administração em área mais larga com lista adaptável. Temas neutros aprovados; cards sem borda, controles lima, foco verde. Convites acessíveis somente ao proprietário. Staging recebe indicador visível em suas páginas, não nos e-mails reais.

Prévia interativa demonstra telas e transições locais; não envia e-mails. As imagens fornecidas são exemplos mobile claros e escuros. Estados acima são contratos propostos, não funcionalidades implementadas. Aprovar ou ajustar o método de login, prazo de convite e primeiro acesso antes do desenvolvimento.
