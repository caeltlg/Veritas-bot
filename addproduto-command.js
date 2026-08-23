// IMPLEMENTAÇÃO DO COMANDO /addproduto (Slash Command)
// Este arquivo contém a lógica completa do comando de adicionar produtos

if (interaction.commandName === 'addproduto') {
    const categoria = interaction.options.getString('categoria', true).trim();
    const nome = interaction.options.getString('nome', true).trim();
    const precoInput = interaction.options.getNumber('preco', true);
    const descricao = interaction.options.getString('descricao', true).trim();
    const estoqueInput = interaction.options.getInteger('estoque') ?? 1;

    // ============= VALIDAÇÕES =============
    
    // 1. Validar campos obrigatórios
    if (!nome || !categoria || !descricao) {
        return interaction.reply({
            content: '❌ Preencha categoria, nome e descrição do produto.',
            ephemeral: true,
        });
    }

    // 2. Limpar e validar preço
    const precoLimpo = parseFloat(
        String(precoInput).replace(/[^\d.,]/g, '').replace(',', '.'),
    );

    if (!Number.isFinite(precoLimpo) || precoLimpo < 0) {
        return interaction.reply({
            content: '❌ Informe um preço válido (apenas números, ex: 400)!',
            ephemeral: true,
        });
    }

    // 3. Validar estoque
    if (!Number.isInteger(estoqueInput) || estoqueInput < 0) {
        return interaction.reply({
            content: '❌ O estoque deve ser um número inteiro maior ou igual a zero.',
            ephemeral: true,
        });
    }

    // ============= CARREGAR E SALVAR PRODUTOS =============
    
    const produtos = carregarProdutos();
    
    // Gerar ID único para o produto
    const idBase = nome.toLowerCase().replace(/\s+/g, '_');
    const idExiste = produtos.some((item) => item.id === idBase);
    const produto = {
        id: idExiste ? `${idBase}_${Date.now()}` : idBase,
        categoria,
        nome,
        preco: precoLimpo,
        descricao,
        media: null,
        entrega: 'Entrega enviada via suporte.',
        estoque: estoqueInput,
    };

    produtos.push(produto);
    salvarProdutos(produtos);

    // ============= RESPOSTA AO USUÁRIO =============
    
    return interaction.reply({
        content:
            `✅ Produto **${produto.nome}** cadastrado com sucesso!\n` +
            `💰 Preço: **${formatarValor(precoLimpo)}**\n` +
            `📦 Estoque: **${estoqueInput}** unidade(s)`,
        ephemeral: true,
    });
}
