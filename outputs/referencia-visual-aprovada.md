# Referência visual oficial — Rotina

**Aprovada pelo usuário em 18 de setembro de 2026.**

**Padrões mobile de header, navegação flutuante, drawer animado e confirmação aprovados em 21 de setembro de 2026.**

**App Shell compartilhado entre as telas autenticadas aprovado em 21 de setembro de 2026.**

**Fluxo e regras de estorno integral de compras aprovados em 21 de setembro de 2026.**

Esta é a base para o planejamento de todas as telas da aplicação. Substitui a direção anterior com fundos esverdeados. O nome Rotina continua provisório.

## Decisões aprovadas

- Modo claro: fundo #F7F7F7, cards #FFFFFF, texto #202020, destaque #232323.
- Modo escuro: fundo #141414, cards #222222, campos #191919, destaque #353535, texto #EEEEEE.
- Fundos, superfícies, textos e sombras neutros, sem tonalidade verde.
- Verde-lima #B5DB69 nos botões principais; tons de verde em tags e bordas/foco de controles.
- Cores semânticas de erro, aviso e informação preservadas nos respectivos indicadores.
- Cards sem bordas; sombra no card em destaque.
- Preservar os espaçamentos, raios e organização apresentados nas prévias aprovadas.
- Mesma linguagem visual no celular e no computador.
- Header mobile respeita a área segura do sistema operacional.
- Navegação mobile flutuante com superfície neutra translúcida e item ativo verde.
- Inserção e edição em bottom sheet animado; confirmações de sucesso em toast acessível.
- Campos de data e mês limitados à viewport, sem rolagem horizontal.

## Arquivos de referência

- [Design system principal](design-system-rotina.md)
- [Especificação do modo escuro](design-system-modo-escuro.md)
- [Catálogo claro aprovado — cópia congelada](referencia-aprovada-claro.html)
- [Catálogo escuro aprovado — cópia congelada](referencia-aprovada-escuro.html)
- [Componentes claros em imagem](referencia-aprovada-claro.png)
- [Componentes escuros em imagem](referencia-aprovada-escuro.png)

Os catálogos contêm dados fictícios e interações demonstrativas. A aprovação estabelece o padrão visual; contratos de novos componentes, regras de negócio e cada fluxo ainda passam pela revisão de UI/UX.

## Processo para qualquer tela ou melhoria

1. Definir o comportamento e os casos relevantes.
2. Mostrar prévia da experiência seguindo esta referência.
3. Ajustar com o usuário e obter aprovação explícita.
4. Implementar e validar apenas o escopo aprovado.

Se uma necessidade durante implementação modificar a experiência, voltar à prévia. Incluir imagens para revisão pelo celular. Aprovação desta referência não inicia desenvolvimento.
