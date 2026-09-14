const fs = require('fs');
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ChannelType, PermissionsBitField, EmbedBuilder } = require('discord.js');

// Token fallbacks
const token = process.env.DISCORD_TOKEN || process.env.DISCORD_TOK || process.env.TOKEN;
if (!token) {
  console.error('Missing Discord token environment variable. Please set DISCORD_TOKEN in your Discloud env.');
  process.exit(1);
}

// Load config if present
let config = {};
try { config = require('./config.json'); } catch (_) { config = {}; }

// Utility to load products file
function carregarProdutos() {
  try {
    const raw = fs.readFileSync('./produtos.json', 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return [];
  }
}

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception thrown:', err);
});

// command to post panel
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (message.content === '!painelvendas' && message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    const produtos = carregarProdutos();
    const embed = new EmbedBuilder()
      .setTitle('🛒 ANBU SHOP — CENTRAL DE VENDAS')
      .setDescription('Selecione abaixo o produto que deseja adquirir e abra seu carrinho de compras!')
      .setColor('#2b2d31')
      .setFooter({ text: 'Atendimento automático & entrega rápida.' });

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('selecionar_produto')
      .setPlaceholder('📦 Selecione o produto desejado...')
      .addOptions(produtos.slice(0, 25).map(p => ({ label: `${p.categoria || ''} ${p.nome}`, description: p.preco || '', value: p.id })));

    const rowMenu = new ActionRowBuilder().addComponents(selectMenu);
    const rowBotao = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('abrir_carrinho').setLabel('🛒 Abrir Carrinho / Gerar PIX').setStyle(ButtonStyle.Success)
    );

    await message.channel.send({ embeds: [embed], components: [rowMenu, rowBotao] });
  }
});

// Safe handler helper
async function safeHandler(interaction, fn) {
  try {
    await fn();
  } catch (err) {
    console.error('Erro no handler de interação:', err);
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: '❌ Erro interno ao processar a interação.', ephemeral: true });
      } else if (interaction.deferred && !interaction.replied) {
        await interaction.editReply({ content: '❌ Erro interno ao processar a interação.' });
      } else {
        await interaction.followUp({ content: '❌ Erro interno ao processar a interação.', ephemeral: true });
      }
    } catch (err2) {
      console.error('Falha ao enviar fallback de erro:', err2);
    }
  }
}

client.on('interactionCreate', async (interaction) => {
  // --- Interceptor rápido: ACK para evitar timeout se o handler demorar ---
  try {
    if (!interaction.deferred && !interaction.replied) {
      if (interaction.isButton()) {
        // Prefer deferUpdate for buttons (edita a mensagem original). If it fails, fallback to deferReply.
        await interaction.deferUpdate().catch(() => interaction.deferReply({ ephemeral: true }).catch(() => {}));
      } else if (interaction.isStringSelectMenu() || interaction.isModalSubmit() || interaction.isContextMenu() || interaction.isChatInputCommand()) {
        await interaction.deferReply({ ephemeral: true }).catch(() => {});
      }
    }
  } catch (err) {
    console.error('Erro no interceptor de interação (não bloqueante):', err);
  }

  // SELECT MENU: selecionar_produto
  if (interaction.isStringSelectMenu() && interaction.customId === 'selecionar_produto') {
    // already deferred by interceptor
    return safeHandler(interaction, async () => {
      const produtos = carregarProdutos();
      const produtoSelecionado = produtos.find(p => p.id === interaction.values[0]);
      if (!produtoSelecionado) return await interaction.editReply({ content: '❌ Produto não encontrado.', ephemeral: true });
      // store selection
      if (!client.selecoesUsuario) client.selecoesUsuario = new Map();
      client.selecoesUsuario.set(interaction.user.id, produtoSelecionado);
      await interaction.editReply({ content: `✅ Você selecionou: **${produtoSelecionado.nome}** (${produtoSelecionado.preco}). Clique no botão para abrir o carrinho.`, ephemeral: true });
    });
  }

  // BUTTON: abrir_carrinho
  if (interaction.isButton() && interaction.customId === 'abrir_carrinho') {
    // already acked by interceptor
    return safeHandler(interaction, async () => {
      const produtos = carregarProdutos();
      const produto = (client.selecoesUsuario && client.selecoesUsuario.get(interaction.user.id));
      if (!produto) return await interaction.editReply({ content: '⚠️ Por favor, selecione um produto primeiro.', ephemeral: true });

      const guild = interaction.guild;
      const existing = guild.channels.cache.find(c => c.name === `carrinho-${interaction.user.username.toLowerCase()}`);
      if (existing) return await interaction.editReply({ content: `Você já possui um carrinho aberto em: ${existing}`, ephemeral: true });

      const ticketChannel = await guild.channels.create({
        name: `carrinho-${interaction.user.username}`,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
        ]
      });

      const pixKey = config.chavePix || process.env.PIX_KEY || 'NÃO CONFIGURADA';
      const embedPix = new EmbedBuilder()
        .setTitle('🛒 SEU CARRINHO DE COMPRAS — ANBU SHOP')
        .setDescription(`Olá ${interaction.user},\n\n📦 **Produto:** ${produto.nome}\n💰 **Valor:** ${produto.preco}\n\n---\n🔑 **Chave PIX:** ${pixKey}\n👤 Titular: ${config.donoNome || 'Anbu Shop'}\n\n📌 Envie o comprovante do PIX neste chat para que um administrador libere seu produto!`)
        .setColor('#00ff7f');

      const rowFechar = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('fechar_carrinho').setLabel('🔒 Fechar Carrinho (Apenas Admins)').setStyle(ButtonStyle.Danger)
      );

      await ticketChannel.send({ content: `${interaction.user}`, embeds: [embedPix], components: [rowFechar] });
      await interaction.editReply({ content: `✅ Carrinho criado em: ${ticketChannel}`, ephemeral: true });
    });
  }

  // BUTTON: fechar_carrinho
  if (interaction.isButton() && interaction.customId === 'fechar_carrinho') {
    // already acked by interceptor
    return safeHandler(interaction, async () => {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return await interaction.editReply({ content: '❌ Apenas administradores podem fechar este carrinho!', ephemeral: true });
      }
      await interaction.editReply({ content: '🔒 Este carrinho será fechado em 5 segundos...' });
      setTimeout(() => { interaction.channel.delete().catch(() => {}); }, 5000);
    });
  }

  // BUTTON: gerarpix_
  if (interaction.isButton() && interaction.customId.startsWith('gerarpix_')) {
    // already acked by interceptor
    return safeHandler(interaction, async () => {
      const pixKey = config.chavePix || process.env.PIX_KEY || 'Chave PIX não configurada';
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(pixKey)}`;

      const embedPix = new EmbedBuilder()
        .setTitle('🔑 Dados para Pagamento PIX')
        .setColor('#00FF00')
        .setDescription(`Copie a chave abaixo para realizar o pagamento no seu banco:\n\n\`\`\`${pixKey}\`\`\`\n📌 *Ou escaneie o QR Code abaixo pelo aplicativo do seu banco:*`)
        .setImage(qrCodeUrl);

      // interaction.editReply will edit the deferred reply; if we used deferUpdate as ack, editReply may throw — use try/catch
      try {
        await interaction.editReply({ embeds: [embedPix] });
      } catch (e) {
        await interaction.followUp({ embeds: [embedPix], ephemeral: true }).catch(() => {});
      }
    });
  }

  // BUTTON: aprovar_
  if (interaction.isButton() && interaction.customId.startsWith('aprovar_')) {
    // already acked by interceptor
    return safeHandler(interaction, async () => {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return await interaction.editReply({ content: '❌ Apenas administradores podem aprovar o pagamento!', ephemeral: true });
      }

      const [, prodId, userId] = interaction.customId.split('_');
      const produtos = carregarProdutos();
      const prod = produtos.find(p => p.id === prodId);

      if (!prod) return await interaction.editReply({ content: '❌ Erro ao localizar o produto.', ephemeral: true });

      const embedEntrega = new EmbedBuilder()
        .setTitle('⚡ PAGAMENTO CONFIRMADO!')
        .setColor('#00FF00')
        .setDescription(`Obrigado pela compra, <@${userId}>!\n\n📦 **Seu Produto:**\n\`\`\`${prod.entrega}\`\`\`\n*Guarde essas informações com segurança!*`);

      await interaction.channel.send({ content: `<@${userId}>`, embeds: [embedEntrega] });

      const logChannel = interaction.guild.channels.cache.find(c => c.name.includes('vendas') || c.name.includes('compras') || c.name.includes('logs'));
      if (logChannel) {
        const embedLog = new EmbedBuilder()
          .setTitle('📦 Venda Confirmada')
          .setColor('#00FF00')
          .setDescription(`👤 **Usuário:** <@${userId}>\n🛒 **Produto:** ${prod.nome}\n💰 **Valor:** ${prod.preco}\n⚙️ **Modalidade:** PIX`);

        await logChannel.send({ embeds: [embedLog] });
      }

      try {
        await interaction.editReply({ content: '✅ Pagamento aprovado, produto liberado e log enviado!', ephemeral: true });
      } catch (e) {
        await interaction.followUp({ content: '✅ Pagamento aprovado, produto liberado e log enviado!', ephemeral: true }).catch(() => {});
      }
    });
  }

  // Buttons for games / buy / trocar: deferUpdate or deferReply
  if (interaction.isButton()) {
    const id = interaction.customId || '';
    if (id.startsWith('ab_') || id.startsWith('crash_') || id.startsWith('buy_') || id.startsWith('trocar_') ) {
      // some of these expect to only update the message
      try {
        await interaction.deferUpdate();
      } catch (e) {
        try { await interaction.deferReply({ ephemeral: true }); } catch (e2) {}
      }

      return safeHandler(interaction, async () => {
        // Placeholder: actual logic should be here; existing code likely handles it.
        // If your project implements the detailed logic elsewhere, this protects from timeouts.
      });
    }
  }

  // Modal submit example: cupom
  if (interaction.isModalSubmit() && interaction.customId === 'modal_cupom_desconto') {
    // already acked by interceptor
    return safeHandler(interaction, async () => {
      const codigo = interaction.fields.getTextInputValue('campo_cupom').toUpperCase().trim();
      // You can implement cupom validation here or keep your existing logic
      try {
        await interaction.editReply({ content: `✅ Cupom ${codigo} processado (placeholder).`, ephemeral: true });
      } catch (e) {
        await interaction.followUp({ content: `✅ Cupom ${codigo} processado (placeholder).`, ephemeral: true }).catch(() => {});
      }
    });
  }

});

client.login(token).catch(err => { console.error('Failed to login:', err); });
