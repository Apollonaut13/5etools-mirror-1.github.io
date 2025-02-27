"use strict";

class LootGenUi extends BaseComponent {
	constructor ({spells, items}) {
		super();

		TabUiUtil.decorate(this);

		this.__meta = {};
		this._meta = this._getProxy("meta", this.__meta);

		this._data = null;
		this._dataSpells = spells;
		this._dataItems = items;

		this._lt_tableMetas = null;

		this._pl_xgeTableLookup = null;

		this._$wrpOutputRows = null;
		this._lootOutputs = [];
	}

	getSaveableState () {
		return {
			...super.getSaveableState(),
			meta: this.__meta,
		};
	}

	setStateFrom (toLoad, isOverwrite = false) {
		super.setStateFrom(toLoad, isOverwrite);
		toLoad.meta && this._proxyAssignSimple("meta", toLoad.meta, isOverwrite);
	}

	addHookAll (hookProp, hook) { return this._addHookAll(hookProp, hook); }

	async pInit () {
		this._data = await DataUtil.loadJSON(`${Renderer.get().baseUrl}/data/loot.json`);
		const tablesMagicItems = await ["A", "B", "C", "D", "E", "F", "G", "H", "I"]
			.pMap(async letter => {
				return {
					letter,
					tableEntry: await Renderer.hover.pCacheAndGet(UrlUtil.PG_TABLES, SRC_DMG, UrlUtil.URL_TO_HASH_BUILDER[UrlUtil.PG_TABLES]({name: `Magic Item Table ${letter}`, source: SRC_DMG})),
				};
			});

		const xgeTables = this._getXgeFauxTables();

		this._lt_tableMetas = [
			null,
			...tablesMagicItems.map(({letter, tableEntry}) => {
				tableEntry = MiscUtil.copy(tableEntry);
				tableEntry.type = "table";
				delete tableEntry.chapter;
				return {
					type: "DMG",
					dmgTableType: letter,
					tableEntry,
					table: this._data.magicItems.find(it => it.type === letter),
				};
			}),
			...xgeTables,
		];

		this._pl_xgeTableLookup = {};
		xgeTables.forEach(({tier, rarity, table}) => MiscUtil.set(this._pl_xgeTableLookup, tier, rarity, table));
	}

	/** Create fake tables for the XGE rules */
	_getXgeFauxTables () {
		const byTier = {};

		this._dataItems
			.filter(item => !Renderer.item.isMundane(item))
			.forEach(item => {
				const tier = item.tier || "other";
				const rarity = item.rarity || (Renderer.item.isMundane(item) ? "unknown" : "unknown (magic)");
				const tgt = MiscUtil.getOrSet(byTier, tier, rarity, []);
				tgt.push(item);
			});

		return Object.entries(byTier)
			.map(([tier, byRarity]) => {
				return Object.entries(byRarity)
					.map(([rarity, items]) => {
						const isMundane = Renderer.item.isMundane({rarity});

						const caption = tier === "other"
							? `Other ${isMundane ? "mundane" : "magic"} items of ${rarity} rarity`
							: `${tier.toTitleCase()}-tier ${isMundane ? "mundane" : "magic"} items of ${rarity} rarity`

						return {
							type: "XGE",
							tier,
							rarity,

							tableEntry: {
								type: "table",
								caption,
								colLabels: [
									`d${items.length}`,
									"Item",
								],
								colStyles: [
									"col-2 text-center",
									"col-10",
								],
								rows: items.map((it, i) => ([i + 1, `{@item ${it.name}|${it.source}}`])),
							},

							table: {
								name: caption,
								source: SRC_XGE,
								page: 135,
								diceType: items.length,
								table: items.map((it, i) => ({min: i + 1, max: i + 1, item: `{@item ${it.name}|${it.source}}`})),
							},
						};
					})
			})
			.flat();
	}

	render ({$stg, $stgLhs, $stgRhs}) {
		if ($stg && ($stgLhs || $stgRhs)) throw new Error(`Only one of "parent stage" and "LHS/RHS stages" may be specified!`);

		const {$stgLhs: $stgLhs_, $stgRhs: $stgRhs_} = this._render_$getStages({$stg, $stgLhs, $stgRhs});

		const iptTabMetas = [
			new TabUiUtil.TabMeta({name: "Random Treasure by CR", hasBorder: true, hasBackground: true}),
			new TabUiUtil.TabMeta({name: "Treasure Tables", hasBorder: true, hasBackground: true}),
			new TabUiUtil.TabMeta({name: "Party Loot", hasBorder: true, hasBackground: true}),
		];

		const tabMetas = this._renderTabs(iptTabMetas, {$parent: $stgLhs_});
		const [tabMetaFindTreasure, tabMetaLootTables, tabMetaPartyLoot] = tabMetas;

		this._render_tabFindTreasure({tabMeta: tabMetaFindTreasure});
		this._render_tabLootTables({tabMeta: tabMetaLootTables});
		this._render_tabPartyLoot({tabMeta: tabMetaPartyLoot});

		this._render_output({$wrp: $stgRhs_});
	}

	/**
	 * If we have been provided an existing pair of left-/right-hand stages, use them.
	 * Otherwise, render a two-column UI, and return each column as a stage.
	 * This allows us to cater for both the pre-baked layout of the Lootgen page, and other, more general,
	 *   components.
	 */
	_render_$getStages ({$stg, $stgLhs, $stgRhs}) {
		if (!$stg) return {$stgLhs, $stgRhs};

		$stgLhs = $(`<div class="flex w-50 h-100"></div>`);
		$stgRhs = $(`<div class="flex-col w-50 h-100"></div>`);

		$$`<div class="flex w-100 h-100">
			${$stgLhs}
			<div class="vr-2 h-100"></div>
			${$stgRhs}
		</div>`.appendTo($stg.empty());

		return {$stgLhs, $stgRhs};
	}

	_render_tabFindTreasure ({tabMeta}) {
		const $selChallenge = ComponentUiUtil.$getSelEnum(
			this,
			"ft_challenge",
			{
				values: Object.keys(LootGenUi._CHALLENGE_RATING_RANGES).map(it => Number(it)),
				fnDisplay: it => LootGenUi._CHALLENGE_RATING_RANGES[it],
			},
		);

		const $cbIsHoard = ComponentUiUtil.$getCbBool(this, "ft_isHoard");

		const $btnRoll = $(`<button class="btn btn-default btn-xs mr-2">Roll Loot</button>`)
			.click(() => this._ft_pDoHandleClickRollLoot());

		const $btnClear = $(`<button class="btn btn-danger btn-xs">Clear Output</button>`)
			.click(() => this._doClearOutput());

		$$`<div class="flex-col py-2 px-3">
			<label class="split-v-center mb-2">
				<div class="mr-2 w-66 no-shrink">Challenge Rating</div>
				${$selChallenge}
			</label>

			<label class="split-v-center mb-3">
				<div class="mr-2 w-66 no-shrink">Is Treasure Hoard?</div>
				${$cbIsHoard}
			</label>

			<div class="flex-v-center mb-2">
				${$btnRoll}
				${$btnClear}
			</div>

			<hr class="hr-3">

			<div class="ve-small italic">${Renderer.get().render(`Based on the tables and rules in the {@book Dungeon Master's Guide|DMG|7|Treasure Tables}`)}, pages 133-149.</div>
		</div>`.appendTo(tabMeta.$wrpTab);
	}

	_ft_pDoHandleClickRollLoot () {
		if (this._state.ft_isHoard) return this._ft_doHandleClickRollLoot_pHoard()
		return this._ft_doHandleClickRollLoot_single()
	}

	_ft_doHandleClickRollLoot_single () {
		const tableMeta = this._data.individual.find(it => it.crMin === this._state.ft_challenge);

		const rowRoll = RollerUtil.randomise(100);
		const row = tableMeta.table.find(it => rowRoll >= it.min && rowRoll <= it.max);

		const coins = Object.entries(row.coins)
			.mergeMap(([type, formula]) => ({[type]: Renderer.dice.parseRandomise2(formula)}));

		const lootOutput = new LootGenOutput({
			name: `{@b Individual Treasure} for challenge rating {@b ${LootGenUi._CHALLENGE_RATING_RANGES[this._state.ft_challenge]}}`,
			coins,
		});
		this._doAddOutput({lootOutput});
	}

	async _ft_doHandleClickRollLoot_pHoard () {
		const tableMeta = this._data.hoard.find(it => it.crMin === this._state.ft_challenge);

		const rowRoll = RollerUtil.randomise(100);
		const row = tableMeta.table.find(it => rowRoll >= it.min && rowRoll <= it.max);

		const coins = Object.entries(tableMeta.coins || {})
			.mergeMap(([type, formula]) => ({[type]: Renderer.dice.parseRandomise2(formula)}));

		const gems = this._ft_doHandleClickRollLoot_hoard_gemsArtObjects({row, prop: "gems"});
		const artObjects = this._ft_doHandleClickRollLoot_hoard_gemsArtObjects({row, prop: "artObjects"});
		const magicItemsByTable = await this._ft_doHandleClickRollLoot_hoard_pMagicItems({row});

		const lootOutput = new LootGenOutput({
			name: `{@b Hoard} for challenge rating {@b ${LootGenUi._CHALLENGE_RATING_RANGES[this._state.ft_challenge]}}`,
			coins,
			gems,
			artObjects,
			magicItemsByTable,
		});
		this._doAddOutput({lootOutput});
	}

	_ft_doHandleClickRollLoot_hoard_gemsArtObjects ({row, prop}) {
		if (!row[prop]) return null;

		const lootMeta = row[prop];

		const specificTable = this._data[prop].find(it => it.type === lootMeta.type);
		const count = Renderer.dice.parseRandomise2(lootMeta.amount);

		const breakdown = {};
		[...new Array(count)]
			.forEach(() => {
				const type = RollerUtil.rollOnArray(specificTable.table);
				breakdown[type] = (breakdown[type] || 0) + 1;
			});

		return new LootGenOutputGemsArtObjects({
			type: lootMeta.type,
			count,
			breakdown,
		});
	}

	async _ft_doHandleClickRollLoot_hoard_pMagicItems ({row}) {
		if (!row.magicItems) return null;

		return row.magicItems.pMap(async ({type, amount}) => {
			const magicItemTable = this._data.magicItems.find(it => it.type === type);
			const count = Renderer.dice.parseRandomise2(amount);

			const breakdown = [];

			await ([...new Array(count)].pSerialAwaitMap(async () => {
				const lootItem = await LootGenMagicItem.pGetMagicItemRoll({
					lootGenMagicItems: breakdown,
					spells: this._dataSpells,
					magicItemTable,
				});
				breakdown.push(lootItem);
			}));

			return new LootGenOutputMagicItems({
				type,
				count,
				breakdown,
			});
		});
	}

	_render_tabLootTables ({tabMeta}) {
		const $selTable = ComponentUiUtil.$getSelEnum(
			this,
			"lt_ixTable",
			{
				values: this._lt_tableMetas.map((_, i) => i),
				fnDisplay: ix => this._lt_tableMetas[ix] == null
					? `\u2014`
					: this._lt_tableMetas[ix].tier
						? `Tier: ${this._lt_tableMetas[ix].tier}; Rarity: ${this._lt_tableMetas[ix].rarity}`
						: this._lt_tableMetas[ix].tableEntry.caption,
			},
		);

		const $btnRoll = $(`<button class="btn btn-default btn-xs mr-2">Roll Loot</button>`)
			.click(() => this._lt_pDoHandleClickRollLoot());

		const $btnClear = $(`<button class="btn btn-danger btn-xs">Clear Output</button>`)
			.click(() => this._doClearOutput());

		const $hrHelp = $(`<hr class="hr-3">`);
		const $dispHelp = $(`<div class="ve-small italic"></div>`);
		const $hrTable = $(`<hr class="hr-3">`);
		const $dispTable = $(`<div class="flex-col w-100"></div>`);

		const hkTable = () => {
			const tableMeta = this._lt_tableMetas[this._state.lt_ixTable];

			$dispHelp.toggleVe(tableMeta != null);
			$dispTable.toggleVe(tableMeta != null);
			$hrHelp.toggleVe(tableMeta != null);
			$hrTable.toggleVe(tableMeta != null);

			if (tableMeta == null) return;

			$dispHelp
				.html(tableMeta.type === "DMG" ? Renderer.get().render(`Based on the tables and rules in the {@book Dungeon Master's Guide|DMG|7|Treasure Tables}, pages 133-149.`) : Renderer.get().render(`Tables auto-generated based on the rules in {@book Xanathar's Guide to Everything (Choosing Items Piecemeal)|XGE|2|choosing items piecemeal}, pages 135-136.`));

			$dispTable.html(Renderer.get().render(tableMeta.tableEntry));
		};
		this._addHookBase("lt_ixTable", hkTable);
		hkTable();

		$$`<div class="flex-col py-2 px-3">
			<label class="split-v-center mb-3">
				<div class="mr-2 w-66 no-shrink">Table</div>
				${$selTable}
			</label>

			<div class="flex-v-center mb-2">
				${$btnRoll}
				${$btnClear}
			</div>

			${$hrHelp}
			${$dispHelp}
			${$hrTable}
			${$dispTable}
		</div>`.appendTo(tabMeta.$wrpTab);
	}

	async _lt_pDoHandleClickRollLoot () {
		const tableMeta = this._lt_tableMetas[this._state.lt_ixTable];
		if (!tableMeta) return JqueryUtil.doToast({type: "warning", content: `Please select a table first!`});

		const lootOutput = new LootGenOutput({
			name: tableMeta.type === "DMG"
				? `Rolled against {@b {@table ${tableMeta.tableEntry.caption}|${SRC_DMG}}}`
				: `Rolled on the table for {@b ${tableMeta.tier} ${tableMeta.rarity}} items`,
			magicItemsByTable: await this._lt_pDoHandleClickRollLoot_pGetMagicItemMetas({tableMeta}),
		});
		this._doAddOutput({lootOutput});
	}

	async _lt_pDoHandleClickRollLoot_pGetMagicItemMetas ({tableMeta}) {
		const breakdown = [];
		const lootItem = await LootGenMagicItem.pGetMagicItemRoll({
			lootGenMagicItems: breakdown,
			spells: this._dataSpells,
			magicItemTable: tableMeta.table,
		});
		breakdown.push(lootItem);

		return [
			new LootGenOutputMagicItems({
				type: tableMeta.dmgTableType,
				count: 1,
				breakdown,
			}),
		];
	}

	_render_tabPartyLoot ({tabMeta}) {
		const $cbIsExactLevel = ComponentUiUtil.$getCbBool(this, "pl_isExactLevel");

		const $cbIsCumulative = ComponentUiUtil.$getCbBool(this, "pl_isCumulative");

		// region Default
		const $selCharLevel = ComponentUiUtil.$getSelEnum(
			this,
			"pl_charLevel",
			{
				values: Object.keys(LootGenUi._PARTY_LOOT_LEVEL_RANGES).map(it => Number(it)),
				fnDisplay: it => LootGenUi._PARTY_LOOT_LEVEL_RANGES[it],
			},
		);

		const $stgDefault = $$`<div class="flex-col w-100">
			<label class="split-v-center mb-2">
				<div class="mr-2 w-66 no-shrink">Character Level</div>
				${$selCharLevel}
			</label>
		</div>`;
		// endregion

		// region Exact level
		const $sliderLevel = ComponentUiUtil.$getSliderRange(
			this,
			{
				propMin: "pl_exactLevelMin",
				propMax: "pl_exactLevelMax",
				propCurMin: "pl_exactLevel",
			},
		)

		const $stgExactLevel = $$`<div class="flex-col w-100">
			<div class="flex-col mb-2">
				<div class="mb-2">Character Level</div>
				${$sliderLevel}
			</div>
		</div>`;
		// endregion

		// region Buttons
		const $btnRoll = $(`<button class="btn btn-default btn-xs mr-2">Roll Loot</button>`)
			.click(() => this._pl_pDoHandleClickRollLoot());

		const $btnClear = $(`<button class="btn btn-danger btn-xs">Clear Output</button>`)
			.click(() => this._doClearOutput());
		// endregion

		const hkIsExactLevel = () => {
			$stgDefault.toggleVe(!this._state.pl_isExactLevel);
			$stgExactLevel.toggleVe(this._state.pl_isExactLevel);
		};
		this._addHookBase("pl_isExactLevel", hkIsExactLevel);
		hkIsExactLevel();

		$$`<div class="flex-col py-2 px-3">
			<p>
				Generates a set of magical items for a party, based on the tables and rules in ${Renderer.get().render(`{@book Xanathar's Guide to Everything|XGE|2|awarding magic items}`)}, pages 135-136.
			</p>
			<p><i>If &quot;Exact Level&quot; is selected, the output will include a proportional number of items for any partially-completed tier.</i></p>

			<hr class="hr-3">

			${$stgDefault}
			${$stgExactLevel}

			<label class="split-v-center mb-2">
				<div class="mr-2 w-66 no-shrink">Cumulative with Previous Tiers</div>
				${$cbIsCumulative}
			</label>

			<label class="split-v-center mb-3">
				<div class="mr-2 w-66 no-shrink">Is Exact Level</div>
				${$cbIsExactLevel}
			</label>

			<div class="flex-v-center mb-2">
				${$btnRoll}
				${$btnClear}
			</div>
		</div>`.appendTo(tabMeta.$wrpTab);
	}

	async _pl_pDoHandleClickRollLoot () {
		const template = this._pl_getLootTemplate();
		const magicItemsByTable = [];

		for (const [tier, byRarity] of Object.entries(template)) {
			const breakdown = [];
			for (const [rarity, cntItems] of Object.entries(byRarity)) {
				const tableMeta = this._pl_xgeTableLookup[tier][rarity];

				for (let i = 0; i < cntItems; ++i) {
					const lootItem = await LootGenMagicItem.pGetMagicItemRoll({
						lootGenMagicItems: breakdown,
						spells: this._dataSpells,
						magicItemTable: tableMeta,
					});
					breakdown.push(lootItem);
				}
			}

			magicItemsByTable.push(
				new LootGenOutputMagicItems({
					count: breakdown.length,
					breakdown,
					tier,
				}),
			)
		}

		const ptLevel = this._state.pl_isExactLevel
			? this._state.pl_exactLevel
			: LootGenUi._PARTY_LOOT_LEVEL_RANGES[this._state.pl_charLevel];
		const lootOutput = new LootGenOutput({
			name: `Magic items for a {@b Level ${ptLevel}} Party`,
			magicItemsByTable,
		});
		this._doAddOutput({lootOutput});
	}

	_pl_getLootTemplate () {
		const {template, levelLow} = this._state.pl_isExactLevel
			? this._pl_getLootTemplate_exactLevel()
			: {template: MiscUtil.copy(LootGenUi._PARTY_LOOT_ITEMS_PER_LEVEL[this._state.pl_charLevel]), levelLow: this._state.pl_charLevel};

		if (this._state.pl_isCumulative) this._pl_mutAccumulateLootTemplate({template, levelLow});

		return template;
	}

	_pl_getLootTemplate_exactLevel () {
		if (LootGenUi._PARTY_LOOT_ITEMS_PER_LEVEL[this._state.pl_exactLevel]) {
			return {
				template: MiscUtil.copy(LootGenUi._PARTY_LOOT_ITEMS_PER_LEVEL[this._state.pl_exactLevel]),
				levelLow: this._state.pl_exactLevel,
			};
		}

		let levelLow = 1;
		let levelHigh = 20;

		Object.keys(LootGenUi._PARTY_LOOT_ITEMS_PER_LEVEL)
			.forEach(level => {
				level = Number(level);

				if (level < this._state.pl_exactLevel && (this._state.pl_exactLevel - level) < (this._state.pl_exactLevel - levelLow)) {
					levelLow = level;
				}

				if (level > this._state.pl_exactLevel && (level - this._state.pl_exactLevel) < (levelHigh - this._state.pl_exactLevel)) {
					levelHigh = level;
				}
			});

		const templateLow = MiscUtil.copy(LootGenUi._PARTY_LOOT_ITEMS_PER_LEVEL[levelLow]);
		const templateHigh = MiscUtil.copy(LootGenUi._PARTY_LOOT_ITEMS_PER_LEVEL[levelHigh]);

		const ratio = (this._state.pl_exactLevel - levelLow) / (levelHigh - levelLow)

		const out = {major: {}, minor: {}};
		Object.entries(out)
			.forEach(([tier, byTier]) => {
				Object.keys(templateLow[tier])
					.forEach(rarity => {
						byTier[rarity] = Math.floor(
							((templateLow[tier]?.[rarity] || 0) * (1 - ratio))
							+ ((templateHigh[tier]?.[rarity] || 0) * ratio),
						);
					});
			});
		return {template: out, levelLow};
	}

	_pl_mutAccumulateLootTemplate ({template, levelLow}) {
		const toAccumulate = Object.keys(LootGenUi._PARTY_LOOT_ITEMS_PER_LEVEL)
			.filter(it => Number(it) < levelLow);
		if (!toAccumulate.length) return;

		toAccumulate.forEach(level => {
			Object.entries(LootGenUi._PARTY_LOOT_ITEMS_PER_LEVEL[level])
				.forEach(([tier, byRarity]) => {
					Object.entries(byRarity)
						.forEach(([rarity, cntItems]) => {
							const existing = MiscUtil.get(template, tier, rarity) || 0;
							MiscUtil.set(template, tier, rarity, existing + (cntItems || 0));
						});
				});
		});
	}

	_render_output ({$wrp}) {
		this._$wrpOutputRows = $(`<div class="w-100 h-100 flex-col overflow-y-auto smooth-scroll"></div>`);

		$$`<div class="flex-col w-100 h-100">
			<h4 class="my-0"><i>Output</i></h4>
			${this._$wrpOutputRows}
		</div>`
			.appendTo($wrp);
	}

	_doAddOutput ({lootOutput}) {
		this._lootOutputs.push(lootOutput);
		lootOutput.render(this._$wrpOutputRows);
	}

	_doClearOutput () {
		this._lootOutputs.forEach(it => it.doRemove());
		this._lootOutputs = [];
	}

	_getDefaultState () {
		return {
			...super._getDefaultState(),

			// region Find Treasure
			ft_challenge: 0,
			ft_isHoard: false,
			// endregion

			// region Loot Tables
			lt_ixTable: null,
			// endregion

			// region Party Loot
			pl_isExactLevel: false,
			pl_isCumulative: false,

			pl_charLevel: 4,

			pl_exactLevelMin: 1,
			pl_exactLevelMax: 20,
			pl_exactLevel: 1,
			// endregion
		};
	}
}
LootGenUi._CHALLENGE_RATING_RANGES = {
	0: "1\u20134",
	5: "5\u201310",
	11: "11\u201316",
	17: "17\u201320",
};
LootGenUi._PARTY_LOOT_LEVEL_RANGES = {
	4: "1\u20134",
	10: "5\u201310",
	16: "11\u201316",
	20: "17+",
};
LootGenUi._PARTY_LOOT_ITEMS_PER_LEVEL = {
	1: {
		"major": {
			"uncommon": 0,
			"rare": 0,
			"very rare": 0,
			"legendary": 0,
		},
		"minor": {
			"common": 0,
			"uncommon": 0,
			"rare": 0,
			"very rare": 0,
			"legendary": 0,
		},
	},
	4: {
		"major": {
			"uncommon": 2,
			"rare": 0,
			"very rare": 0,
			"legendary": 0,
		},
		"minor": {
			"common": 6,
			"uncommon": 2,
			"rare": 1,
			"very rare": 0,
			"legendary": 0,
		},
	},
	10: {
		"major": {
			"uncommon": 5,
			"rare": 1,
			"very rare": 0,
			"legendary": 0,
		},
		"minor": {
			"common": 10,
			"uncommon": 12,
			"rare": 5,
			"very rare": 1,
			"legendary": 0,
		},
	},
	16: {
		"major": {
			"uncommon": 1,
			"rare": 2,
			"very rare": 2,
			"legendary": 1,
		},
		"minor": {
			"common": 3,
			"uncommon": 6,
			"rare": 9,
			"very rare": 5,
			"legendary": 1,
		},
	},
	20: {
		"major": {
			"uncommon": 0,
			"rare": 1,
			"very rare": 2,
			"legendary": 3,
		},
		"minor": {
			"common": 0,
			"uncommon": 0,
			"rare": 4,
			"very rare": 9,
			"legendary": 6,
		},
	},
};

class LootGenOutput {
	constructor (
		{
			name,
			coins,
			gems,
			artObjects,
			magicItemsByTable,
		},
	) {
		this._name = name;
		this._coins = coins;
		this._gems = gems;
		this._artObjects = artObjects;
		this._magicItemsByTable = magicItemsByTable;
	}

	render ($parent) {
		const $btnSendToFoundry = !IS_VTT && ExtensionUtil.ACTIVE
			? $(`<button title="Send to Foundry (SHIFT for Temporary Import)" class="btn btn-xs btn-default"><span class="glyphicon glyphicon-send"></span></button>`)
				.click(evt => this._pDoSendToFoundry({isTemp: !!evt.shiftKey}))
			: null;

		this._$wrp = $$`<div class="flex-col lootg__wrp-output py-3 px-2 my-2 mr-1">
			<h4 class="mt-1 mb-2 split-v-center">
				<div>${Renderer.get().render(this._name)}</div>
				${$btnSendToFoundry}
			</h4>
			<ul>
				${this._render_$getPtValueSummary()}
				${this._render_$getPtCoins()}
				${this._render_$getPtGemsArtObjects({loot: this._gems, name: "gemstones"})}
				${this._render_$getPtGemsArtObjects({loot: this._artObjects, name: "art objects"})}
				${this._render_$getPtMagicItems()}
			</ul>
		</div>`.prependTo($parent);
	}

	async _pDoSendToFoundry ({isTemp}) {
		if (this._coins) await ExtensionUtil.pDoSendCurrency({currency: this._coins});

		if (this._gems) await this._pDoSendToFoundry_gemsArtObjects({isTemp, loot: this._gems});
		if (this._artObjects) await this._pDoSendToFoundry_gemsArtObjects({isTemp, loot: this._artObjects});

		if (this._magicItemsByTable?.length) {
			for (const magicItemsByTable of this._magicItemsByTable) {
				for (const {item} of magicItemsByTable.breakdown) {
					await ExtensionUtil.pDoSendStatsPreloaded({
						page: UrlUtil.PG_ITEMS,
						entity: item,
						isTemp,
					});
				}
			}
		}
	}

	async _pDoSendToFoundry_gemsArtObjects ({isTemp, loot}) {
		const uidToCount = {};
		const specialItemMetas = {}; // For any rows which don't actually map to an item

		Object.entries(loot.breakdown)
			.forEach(([entry, count]) => {
				let cntFound = 0;
				entry.replace(/{@item ([^}]+)}/g, (...m) => {
					cntFound++;
					const [name, source] = m[1].toLowerCase().split("|").map(it => it.trim()).filter(Boolean);
					const uid = `${name}|${source || SRC_DMG}`.toLowerCase();
					uidToCount[uid] = (uidToCount[uid] || 0) + count;
					return "";
				});

				if (cntFound) return;

				// If we couldn't find any real items in this row, prepare a dummy item
				const uidFaux = entry.toLowerCase().trim();

				specialItemMetas[uidFaux] = specialItemMetas[uidFaux] || {
					count: 0,
					item: {
						name: Renderer.stripTags(entry).uppercaseFirst(),
						source: SRC_DMG,
						type: "OTH",
						rarity: "unknown",
					},
				};

				specialItemMetas[uidFaux].count += count;
			});

		for (const [uid, count] of Object.entries(uidToCount)) {
			const [name, source] = uid.split("|");
			const item = await Renderer.hover.pCacheAndGet(UrlUtil.PG_ITEMS, source, UrlUtil.URL_TO_HASH_BUILDER[UrlUtil.PG_ITEMS]({name, source}));
			await ExtensionUtil.pDoSendStatsPreloaded({
				page: UrlUtil.PG_ITEMS,
				entity: item,
				isTemp,
				options: {
					quantity: count,
				},
			});
		}

		for (const {count, item} of Object.values(specialItemMetas)) {
			await ExtensionUtil.pDoSendStatsPreloaded({
				page: UrlUtil.PG_ITEMS,
				entity: item,
				isTemp,
				options: {
					quantity: count,
				},
			});
		}
	}

	_render_$getPtValueSummary () {
		if ([this._coins, this._gems, this._artObjects].filter(Boolean).length <= 1) return null;

		const totalValue = [
			this._coins ? CurrencyUtil.getAsCopper(this._coins) : 0,
			this._gems ? this._gems.type * this._gems.count * 100 : 0,
			this._artObjects ? this._artObjects.type * this._artObjects.count * 100 : 0,
		].sum();

		return $(`<li class="italic ve-muted">A total of ${(totalValue / 100).toLocaleString()} gp worth of coins, art objects, and/or gems, as follows:</li>`)
	}

	_render_$getPtCoins () {
		if (!this._coins) return null;

		const total = CurrencyUtil.getAsCopper(this._coins);
		const breakdown = [...Parser.COIN_ABVS]
			.reverse()
			.filter(it => this._coins[it])
			.map(it => `${this._coins[it].toLocaleString()} ${it}`);

		return $$`
			<li>${(total / 100).toLocaleString()} gp in coinage:</li>
			<ul>
				${breakdown.map(it => `<li>${it}</li>`).join("")}
			</ul>
		`;
	}

	_render_$getPtGemsArtObjects ({loot, name}) {
		if (!loot) return null;

		return $$`
			<li>${(loot.type).toLocaleString()} gp ${name} (×${loot.count}; worth ${((loot.type * loot.count)).toLocaleString()} gp total):</li>
			<ul>
				${Object.entries(loot.breakdown).map(([result, count]) => `<li>${Renderer.get().render(result)}${count > 1 ? `, ×${count}` : ""}</li>`).join("")}
			</ul>
		`;
	}

	_render_$getPtMagicItems () {
		if (!this._magicItemsByTable?.length) return null;

		return [...this._magicItemsByTable]
			.sort(({tier: tierA, type: typeA}, {tier: tierB, type: typeB}) => this.constructor._ascSortTier(tierB, tierA) || SortUtil.ascSortLower(typeA || "", typeB || ""))
			.map(magicItems => {
				// If we're in "tier" mode, sort the items into groups by rarity
				if (magicItems.tier) {
					const byRarity = {};

					magicItems.breakdown
						.forEach(lootItem => {
							const tgt = MiscUtil.getOrSet(byRarity, lootItem.item.rarity, []);
							tgt.push(lootItem);
						});

					const $ulsByRarity = Object.entries(byRarity)
						.sort(([rarityA], [rarityB]) => SortUtil.ascSortItemRarity(rarityB, rarityA))
						.map(([rarity, lootItems]) => {
							return $$`
								<li>${rarity.toTitleCase()} items (×${lootItems.length}):</li>
								<ul>${lootItems.map(it => it.$getRender())}</ul>
							`;
						})

					return $$`
						<li>${magicItems.tier.toTitleCase()} items:</li>
						<ul>
							${$ulsByRarity}
						</ul>
					`;
				}

				return $$`
					<li>Magic Items${magicItems.type ? ` (${Renderer.get().render(`{@table Magic Item Table ${magicItems.type}||Table ${magicItems.type}}`)})` : ""}${(magicItems.count || 0) > 1 ? ` (×${magicItems.count})` : ""}</li>
					<ul>${magicItems.breakdown.map(it => it.$getRender())}</ul>
				`
			});
	}

	doRemove () {
		if (this._$wrp) this._$wrp.remove();
	}

	static _ascSortTier (a, b) { return LootGenOutput._TIERS.indexOf(a) - LootGenOutput._TIERS.indexOf(b); }
}
LootGenOutput._TIERS = ["other", "minor", "major"];

class LootGenOutputGemsArtObjects {
	constructor (
		{
			type,
			count,
			breakdown,
		},
	) {
		this.type = type;
		this.count = count;
		this.breakdown = breakdown;
	}
}

class LootGenOutputMagicItems {
	constructor (
		{
			type,
			count,
			breakdown,
			tier,
		},
	) {
		this.type = type;
		this.count = count;
		this.breakdown = breakdown;
		this.tier = tier;
	}
}

class LootGenMagicItem extends BaseComponent {
	static async pGetMagicItemRoll ({lootGenMagicItems, spells, magicItemTable}) {
		const rowRoll = RollerUtil.randomise(magicItemTable.diceType ?? 100);
		const row = magicItemTable.table.find(it => rowRoll >= it.min && rowRoll <= (it.max ?? it.min));

		if (row.spellLevel != null) {
			return new LootGenMagicItemSpellScroll({
				lootGenMagicItems,
				spells,
				magicItemTable,
				baseEntry: row.item,
				item: await this._pGetMagicItemRoll_pGetItem({nameOrUid: row.item}),
				roll: rowRoll,
				spellLevel: row.spellLevel,
				spell: RollerUtil.rollOnArray(spells.filter(it => it.level === row.spellLevel)),
			});
		}

		if (row.choose?.fromGeneric) {
			const subItems = (await row.choose?.fromGeneric.pMap(nameOrUid => this._pGetMagicItemRoll_pGetItem({nameOrUid})))
				.map(it => it.variants.map(({specificVariant}) => specificVariant))
				.flat();

			return new LootGenMagicItemSubItems({
				lootGenMagicItems,
				spells,
				magicItemTable,
				baseEntry: row.item ?? `{@item ${row.choose.fromGeneric[0]}}`,
				item: RollerUtil.rollOnArray(subItems),
				roll: rowRoll,
				subItems,
			});
		}

		if (row.choose?.fromGroup) {
			const subItems = (await ((await row.choose?.fromGroup.pMap(nameOrUid => this._pGetMagicItemRoll_pGetItem({nameOrUid})))
				.pMap(it => it.items.pMap(x => this._pGetMagicItemRoll_pGetItem({nameOrUid: x})))))
				.flat();

			return new LootGenMagicItemSubItems({
				lootGenMagicItems,
				spells,
				magicItemTable,
				baseEntry: row.item ?? `{@item ${row.choose.fromGroup[0]}}`,
				item: RollerUtil.rollOnArray(subItems),
				roll: rowRoll,
				subItems,
			});
		}

		if (row.choose?.fromItems) {
			const subItems = await row.choose?.fromItems.pMap(nameOrUid => this._pGetMagicItemRoll_pGetItem({nameOrUid}));

			return new LootGenMagicItemSubItems({
				lootGenMagicItems,
				spells,
				magicItemTable,
				baseEntry: row.item,
				item: RollerUtil.rollOnArray(subItems),
				roll: rowRoll,
				subItems,
			});
		}

		if (row.table) {
			const min = Math.min(...row.table.map(it => it.min));
			const max = Math.max(...row.table.map(it => it.max ?? min));

			const {subRowRoll, subRow, subItem} = await LootGenMagicItemTable.pGetSubRollMeta({
				min,
				max,
				subTable: row.table,
			});

			return new LootGenMagicItemTable({
				lootGenMagicItems,
				spells,
				magicItemTable,
				baseEntry: row.item,
				item: subItem,
				roll: rowRoll,
				table: row.table,
				tableMinRoll: min,
				tableMaxRoll: max,
				tableEntry: subRow.item,
				tableRoll: subRowRoll,
			});
		}

		return new LootGenMagicItem({
			lootGenMagicItems,
			spells,
			magicItemTable,
			baseEntry: row.item,
			item: await this._pGetMagicItemRoll_pGetItem({nameOrUid: row.item}),
			roll: rowRoll,
		});
	}

	static async _pGetMagicItemRoll_pGetItem ({nameOrUid}) {
		nameOrUid = nameOrUid.replace(/{@item ([^}]+)}/g, (...m) => m[1]);
		const uid = (nameOrUid.includes("|") ? nameOrUid : `${nameOrUid}|${SRC_DMG}`).toLowerCase();
		const [name, source] = uid.split("|");
		return Renderer.hover.pCacheAndGet(UrlUtil.PG_ITEMS, source, UrlUtil.URL_TO_HASH_BUILDER[UrlUtil.PG_ITEMS]({name, source}));
	}

	/**
	 * @param lootGenMagicItems The parent array in which this item is stored.
	 * @param spells Spell data list.
	 * @param magicItemTable The table this result was rolled form.
	 * @param baseEntry The text, which may be an item itself, supplied by the `"item"` property in the row.
	 * @param item The rolled item.
	 * @param roll The roll result used to get this row.
	 */
	constructor (
		{
			lootGenMagicItems,
			spells,
			magicItemTable,
			baseEntry,
			item,
			roll,
		},
	) {
		super();
		this._lootGenMagicItems = lootGenMagicItems;
		this._spells = spells;
		this._magicItemTable = magicItemTable;

		this._state.baseEntry = baseEntry;
		this._state.item = item;
		this._state.roll = roll;

		this._$render = null;
	}

	get item () { return this._state.item; }

	async _pDoReroll () {
		const nxt = await this.constructor.pGetMagicItemRoll({
			lootGenMagicItems: this._lootGenMagicItems,
			spells: this._spells,
			magicItemTable: this._magicItemTable,
		});

		this._lootGenMagicItems.splice(this._lootGenMagicItems.indexOf(this), 1, nxt);

		if (!this._$render) return;
		this._$render.replaceWith(nxt.$getRender());
	}

	_$getBtnReroll () {
		return $(`<span class="roller">[reroll]</span>`)
			.mousedown(evt => evt.preventDefault())
			.click(() => this._pDoReroll());
	}

	$getRender () {
		if (this._$render) return this._$render;
		return this._$render = this._$getRender();
	}

	_$getRender () {
		const $dispBaseEntry = this._$getRender_$getDispBaseEntry();
		const $dispRoll = this._$getRender_$getDispRoll();

		const $btnReroll = this._$getBtnReroll();

		return $$`<li class="split-v-center">
			<div class="flex-v-center flex-wrap pr-3">
				${$dispBaseEntry}
				${$dispRoll}
			</div>
			${$btnReroll}
		</li>`;
	}

	_$getRender_$getDispBaseEntry ({prop = "baseEntry"} = {}) {
		const $dispBaseEntry = $(`<div class="mr-2"></div>`);
		const hkBaseEntry = () => $dispBaseEntry.html(Renderer.get().render(this._state[prop]))
		this._addHookBase(prop, hkBaseEntry);
		hkBaseEntry();
		return $dispBaseEntry;
	}

	_$getRender_$getDispRoll ({prop = "roll"} = {}) {
		const $dispRoll = $(`<div class="ve-muted"></div>`);
		const hkRoll = () => $dispRoll.text(`(Rolled ${this._state[prop]})`);
		this._addHookBase(prop, hkRoll);
		hkRoll();
		return $dispRoll;
	}

	_getDefaultState () {
		return {
			...super._getDefaultState(),
			baseEntry: null,
			item: null,
			roll: null,
		};
	}
}

class LootGenMagicItemSpellScroll extends LootGenMagicItem {
	constructor (
		{
			lootGenMagicItems,
			spells,
			magicItemTable,
			baseEntry,
			item,
			roll,
			spellLevel,
			spell,
		},
	) {
		super({lootGenMagicItems, spells, magicItemTable, baseEntry, item, roll});

		this._state.spellLevel = spellLevel;
		this._state.spell = spell;
	}

	_$getRender () {
		const $dispBaseEntry = this._$getRender_$getDispBaseEntry();
		const $dispRoll = this._$getRender_$getDispRoll();

		const $btnRerollSpell = $(`<span class="roller mr-2">[reroll]</span>`)
			.mousedown(evt => evt.preventDefault())
			.click(() => {
				this._state.spell = RollerUtil.rollOnArray(this._spells);
			});

		const $dispSpell = $(`<div></div>`);
		const hkSpell = () => $dispSpell.html(Renderer.get().render(`{@spell ${this._state.spell.name}|${this._state.spell.source}}`))
		this._addHookBase("spell", hkSpell);
		hkSpell();

		const $btnReroll = this._$getBtnReroll();

		return $$`<li class="split-v-center">
			<div class="flex-v-center flex-wrap pr-3">
				${$dispBaseEntry}
				<div class="flex-v-center italic mr-2">
					<span>(</span>
					${$btnRerollSpell}
					${$dispSpell}
					<span class="ve-muted mx-2">-or-</span>
					${Renderer.get().render(`{@filter see all ${Parser.spLevelToFullLevelText(this._state.spellLevel, true)} spells|spells|level=${this._state.spellLevel}}`)}
					<span>)</span>
				</div>
				${$dispRoll}
			</div>
			${$btnReroll}
		</li>`;
	}

	_getDefaultState () {
		return {
			...super._getDefaultState(),
			spellLevel: null,
			spell: null,
		};
	}
}

class LootGenMagicItemSubItems extends LootGenMagicItem {
	constructor (
		{
			lootGenMagicItems,
			spells,
			magicItemTable,
			baseEntry,
			item,
			roll,
			subItems,
		},
	) {
		super({lootGenMagicItems, spells, magicItemTable, baseEntry, item, roll});
		this._subItems = subItems;
	}

	_$getRender () {
		const $dispBaseEntry = this._$getRender_$getDispBaseEntry();
		const $dispRoll = this._$getRender_$getDispRoll();

		const $btnRerollSubItem = $(`<span class="roller mr-2">[reroll]</span>`)
			.mousedown(evt => evt.preventDefault())
			.click(() => {
				this._state.item = RollerUtil.rollOnArray(this._subItems);
			});

		const $dispSubItem = $(`<div></div>`);
		const hkItem = () => $dispSubItem.html(Renderer.get().render(`{@item ${this._state.item.name}|${this._state.item.source}}`))
		this._addHookBase("item", hkItem);
		hkItem();

		const $btnReroll = this._$getBtnReroll();

		return $$`<li class="split-v-center">
			<div class="flex-v-center flex-wrap pr-3">
				${$dispBaseEntry}
				<div class="flex-v-center italic mr-2">
					<span>(</span>
					${$btnRerollSubItem}
					${$dispSubItem}
					<span>)</span>
				</div>
				${$dispRoll}
			</div>
			${$btnReroll}
		</li>`;
	}
}

class LootGenMagicItemTable extends LootGenMagicItem {
	static async pGetSubRollMeta ({min, max, subTable}) {
		const subRowRoll = RollerUtil.randomise(max, min);
		const subRow = subTable.find(it => subRowRoll >= it.min && subRowRoll <= (it.max ?? it.min));

		return {
			subRowRoll,
			subRow,
			subItem: await this._pGetMagicItemRoll_pGetItem({nameOrUid: subRow.item}),
		};
	}

	constructor (
		{
			lootGenMagicItems,
			spells,
			magicItemTable,
			baseEntry,
			item,
			roll,
			table,
			tableMinRoll,
			tableMaxRoll,
			tableEntry,
			tableRoll,
		},
	) {
		super({lootGenMagicItems, spells, magicItemTable, baseEntry, item, roll});
		this._table = table;
		this._tableMinRoll = tableMinRoll;
		this._tableMaxRoll = tableMaxRoll;
		this._state.tableEntry = tableEntry;
		this._state.tableRoll = tableRoll;
	}

	_$getRender () {
		const $dispBaseEntry = this._$getRender_$getDispBaseEntry();
		const $dispRoll = this._$getRender_$getDispRoll();

		const $dispTableEntry = this._$getRender_$getDispBaseEntry({prop: "tableEntry"});
		const $dispTableRoll = this._$getRender_$getDispRoll({prop: "tableRoll"});

		const $btnReroll = this._$getBtnReroll();

		const $btnRerollSub = $(`<span class="roller ve-small self-flex-end">[reroll]</span>`)
			.mousedown(evt => evt.preventDefault())
			.click(async () => {
				const {subRowRoll, subRow, subItem} = await LootGenMagicItemTable.pGetSubRollMeta({
					min: this._tableMinRoll,
					max: this._tableMaxRoll,
					subTable: this._table,
				});

				this._state.item = subItem;
				this._state.tableEntry = subRow.item;
				this._state.tableRoll = subRowRoll;
			});

		return $$`<li class="flex-col">
			<div class="split-v-center">
				<div class="flex-v-center flex-wrap pr-3">
					${$dispBaseEntry}
					${$dispRoll}
				</div>
				${$btnReroll}
			</div>
			<div class="split-v-center pl-2">
				<div class="flex-v-center flex-wrap pr-3">
					<span class="ml-1 mr-2">&rarr;</span>
					${$dispTableEntry}
					${$dispTableRoll}
				</div>
				${$btnRerollSub}
			</div>
		</li>`;
	}
}
