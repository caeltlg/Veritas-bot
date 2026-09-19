const fs = require('fs');
const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelType,
  PermissionsBitField,
  EmbedBuilder
} = require('discord.js');

const token = process.env.DISCORD_TOKEN || process.env.DISCORD_TOK || process.env.TOKEN;
if (!token) {
  console.error('Missing Discord token environment variable. Please set DISCORD_TOKEN in your Discloud env.');
  process.exit(1);
}

let config = {};
try { config = require('./config.json'); } catch (_) { config = {}; }

function carregarProdutos() {
  try {
    return JSON.parse(fs.readFileSync('./produtos.json', 'utf8'));
  } catch (_) {
    return [];
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.selecoesUsuario = new Map();

client.once('ready', async () => {
  console.log(`🤖 Bot ${client.user.tag} está online no Discloud!`);

  const canalId = process.env.CANAL_STATUS_ID || '1536057245958275094';
  const canal = await client.channels.fetch(canalId).catch((err) => {
    console.error(`❌ Não foi possível encontrar o canal de status ${canalId}:`, err.message);
    return null;
  });

  if (!canal || !canal.isTextBased()) {
    console.error(`❌ O canal ${canalId} não é um canal de texto válido.`);
    return;
  }

  await canal.send('🟢 **Veritas Bot está ONLINE! A loja está aberta.**').catch((err) => {
    console.error('❌ Não foi possível enviar a mensagem de status. Verifique as permissões do bot:', err.message);
  });
});

process.on('unhandledRejection', (reason) => console.error('Unhandled Rejection:', reason));
process.on('uncaughtException', (err) => console.error('Uncaught Exception:', err));

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  if (
    message.content === '!painelvendas' &&
    message.member.permissions.has(PermissionsBitField.Flags.Administrator)
  ) {
    const produtos = carregarProdutos();
    const embed = new EmbedBuilder()
      .setTitle('🛒 ANBU SHOP — CENTRAL DE VENDAS')
      .setDescription('Selecione abaixo o produto que deseja adquirir e abra seu carrinho de compras!')
      .setColor('#2b2d31')
      .setFooter({ text: 'Atendimento automático & entrega rápida.' });

    const options = produtos.slice(0, 25).map((p) => ({
      label: `${p.categoria || ''} ${p.nome || 'Produto'}`.trim(),
      description: p.preco || 'Preço não informado',
      value: String(p.id)
    }));

    if (!options.length) {
      await message.reply('❌ Nenhum produto foi cadastrado.');
      return;
    }

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('selecionar_produto')
      .setPlaceholder('📦 Selecione o produto desejado...')
      .addOptions(options);

    const rowMenu = new ActionRowBuilder().addComponents(selectMenu);
    const rowBotao = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('abrir_carrinho')
        .setLabel('🛒 Abrir Carrinho / Gerar PIX')
        .setStyle(ButtonStyle.Success)
    );

    await message.channel.send({ embeds: [embed], components: [rowMenu, rowBotao] });
  }
});

async function responderErro(interaction, erro) {
  console.error('Erro no handler de interação:', erro);
  const resposta = { content: '❌ Erro interno ao processar a interação.', ephemeral: true };
  try {
    if (interaction.replied || interaction.deferred) await interaction.followUp(resposta);
    else await interaction.reply(resposta);
  } catch (_) {}
}

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isStringSelectMenu() && interaction.customId === 'selecionar_produto') {
      const produto = carregarProdutos().find((p) => String(p.id) === interaction.values[0]);
      if (!produto) return interaction.reply({ content: '❌ Produto não encontrado.', ephemeral: true });

      client.selecoesUsuario.set(interaction.user.id, produto);
      return interaction.reply({
        content: `✅ Você selecionou: **${produto.nome}** (${produto.preco}). Clique no botão para abrir o carrinho.`,
        ephemeral: true
      });
    }

    if (interaction.isButton() && interaction.customId === 'abrir_carrinho') {
      const produto = client.selecoesUsuario.get(interaction.user.id);
      if (!produto) {
        return interaction.reply({ content: '⚠️ Por favor, selecione um produto primeiro.', ephemeral: true });
      }

      const nome = `carrinho-${interaction.user.username.toLowerCase()}`;
      const existente = interaction.guild.channels.cache.find((c) => c.name === nome);
      if (existente) {
        return interaction.reply({ content: `Você já possui um carrinho aberto em: ${existente}`, ephemeral: true });
      }

      const canal = await interaction.guild.channels.create({
        name: nome,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
        ]
      });

      const pix = config.chavePix || process.env.PIX_KEY || 'NÃO CONFIGURADA';
      const embed = new EmbedBuilder()
        .setTitle('🛒 SEU CARRINHO DE COMPRAS — ANBU SHOP')
        .setDescription(`Olá ${interaction.user},\n\n📦 **Produto:** ${produto.nome}\n💰 **Valor:** ${produto.preco}\n\n🔑 **Chave PIX:** ${pix}`)
        .setColor('#00ff7f');

      const botoes = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('fechar_carrinho').setLabel('🔒 Fechar Carrinho').setStyle(ButtonStyle.Danger)
      );

      await canal.send({ content: `${interaction.user}`, embeds: [embed], components: [botoes] });
      return interaction.reply({ content: `✅ Carrinho criado em: ${canal}`, ephemeral: true });
    }

    if (interaction.isButton() && interaction.customId === 'fechar_carrinho') {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({ content: '❌ Apenas administradores podem fechar este carrinho!', ephemeral: true });
      }

      await interaction.reply('🔒 Este carrinho será fechado em 5 segundos...');
      setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
    }
  } catch (err) {
    await responderErro(interaction, err);
  }
});

client.login(token).catch((err) => console.error('Failed to login:', err));
