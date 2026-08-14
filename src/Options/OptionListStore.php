<?php

namespace MediaWiki\Extension\InfothequeCore\Options;

use MediaWiki\MediaWikiServices;

/**
 * DB-backed option lists (Support icons, Format icons, Langue, Pilotes
 * types) managed via Special:InfothequeCoreOptions instead of hardcoded in
 * SchemaRegistry. Falls back to an empty list — callers pair this with
 * their own default — so a fresh install (migration not yet run) or an
 * emptied-out list doesn't break form rendering.
 */
class OptionListStore {

	/**
	 * @param string $listId
	 * @return list<array{key:string,label:string,wikitext:?string}>
	 */
	public static function getOptions( string $listId ): array {
		try {
			$db = MediaWikiServices::getInstance()->getConnectionProvider()->getReplicaDatabase();
			$res = $db->newSelectQueryBuilder()
				->select( [ 'ithco_key', 'ithco_label', 'ithco_wikitext' ] )
				->from( 'ithc_options' )
				->where( [ 'ithco_list' => $listId ] )
				->orderBy( 'ithco_sort' )
				->caller( __METHOD__ )
				->fetchResultSet();
		} catch ( \Throwable $e ) {
			// Table missing (migration not run yet) or any other DB hiccup:
			// behave as if the list is empty, let the caller's fallback apply.
			return [];
		}

		$options = [];
		foreach ( $res as $row ) {
			$options[] = [
				'key' => (string)$row->ithco_key,
				'label' => (string)$row->ithco_label,
				'wikitext' => $row->ithco_wikitext !== null ? (string)$row->ithco_wikitext : null,
			];
		}
		return $options;
	}

	/** Plain label list — for the langue/pilotes-types lists, which have no key/wikitext of their own. */
	public static function getLabels( string $listId ): array {
		return array_column( self::getOptions( $listId ), 'label' );
	}

	/**
	 * Replaces a whole list atomically (delete + re-insert in the given
	 * order) — simpler and safer than diffing individual rows for a list
	 * this small, edited by one admin through a single textarea submit.
	 *
	 * @param string $listId
	 * @param list<array{key:string,label:string,wikitext:?string}> $options
	 */
	public static function replaceList( string $listId, array $options ): void {
		$db = MediaWikiServices::getInstance()->getConnectionProvider()->getPrimaryDatabase();
		$db->startAtomic( __METHOD__ );

		$db->newDeleteQueryBuilder()
			->deleteFrom( 'ithc_options' )
			->where( [ 'ithco_list' => $listId ] )
			->caller( __METHOD__ )
			->execute();

		$rows = [];
		$sort = 0;
		foreach ( $options as $opt ) {
			$rows[] = [
				'ithco_list' => $listId,
				'ithco_sort' => $sort++,
				'ithco_key' => $opt['key'],
				'ithco_label' => $opt['label'],
				'ithco_wikitext' => $opt['wikitext'] ?? null,
			];
		}
		if ( $rows !== [] ) {
			$db->newInsertQueryBuilder()
				->insertInto( 'ithc_options' )
				->rows( $rows )
				->caller( __METHOD__ )
				->execute();
		}

		$db->endAtomic( __METHOD__ );
	}
}
