<?php

namespace MediaWiki\Extension\InfothequeCore\Special;

use HTMLForm;
use MediaWiki\Extension\InfothequeCore\Options\OptionListStore;
use MediaWiki\Html\Html;
use SpecialPage;

/**
 * Admin page for the option lists SchemaRegistry used to hardcode
 * (Support icons, Format icons, Langue, Pilotes types) — see
 * OptionListStore. A classic full-page-reload SpecialPage is the right
 * tool here (unlike the editor overlay): this is an occasional bulk-edit
 * task for one trusted admin, not an AJAX-driven UI, so a single textarea
 * per list (one entry per line) is proportionate — no need for the
 * dynamic add/remove/reorder row UI built for the content-entry forms.
 */
class SpecialInfothequeCoreOptions extends SpecialPage {

	/**
	 * @var array<string,array{label:string,hasWikitext:bool}>
	 */
	private const LISTS = [
		'support-icons' => [ 'label' => 'Icônes Support (Téléchargements logiciels/jeux)', 'hasWikitext' => true ],
		'format-icons' => [ 'label' => 'Icônes Format (Manuels & documentation)', 'hasWikitext' => true ],
		'langue' => [ 'label' => 'Langue (Téléchargements et Manuels)', 'hasWikitext' => false ],
		'pilotes-types' => [ 'label' => 'Types de pilotes', 'hasWikitext' => false ],
	];

	public function __construct() {
		parent::__construct( 'InfothequeCoreOptions', 'ithc-manage-options' );
	}

	/** @inheritDoc */
	public function execute( $subPage ) {
		$this->setHeaders();
		$this->outputHeader();
		$this->checkPermissions();

		if ( $subPage === null || $subPage === '' || !isset( self::LISTS[ $subPage ] ) ) {
			$this->showListSelector();
			return;
		}

		try {
			$this->showListEditor( $subPage );
		} catch ( \Throwable $e ) {
			$this->getOutput()->addHTML( Html::errorBox( Html::element( 'pre', [],
				get_class( $e ) . ': ' . $e->getMessage() . "\n" . $e->getFile() . ':' . $e->getLine()
			) ) );
		}
	}

	private function showListSelector(): void {
		$out = $this->getOutput();
		$out->addHTML( Html::openElement( 'ul' ) );
		foreach ( self::LISTS as $id => $info ) {
			$out->addHTML( Html::rawElement( 'li', [],
				Html::element( 'a', [ 'href' => $this->getPageTitle( $id )->getLocalURL() ], $info['label'] )
			) );
		}
		$out->addHTML( Html::closeElement( 'ul' ) );
	}

	private function showListEditor( string $listId ): void {
		$info = self::LISTS[ $listId ];
		$out = $this->getOutput();
		$out->setPageTitle( $info['label'] );
		$out->addSubtitle( Html::element( 'a',
			[ 'href' => $this->getPageTitle()->getLocalURL() ],
			'← ' . $this->msg( 'infothequecore-options-back' )->text()
		) );

		$current = OptionListStore::getOptions( $listId );
		$out->addHTML( Html::element( 'p', [], $info['hasWikitext']
			? $this->msg( 'infothequecore-options-format-help-wikitext' )->text()
			: $this->msg( 'infothequecore-options-format-help-plain' )->text()
		) );

		$formDescriptor = [
			'entries' => [
				'type' => 'textarea',
				'rows' => 15,
				'default' => $this->serializeEntries( $current, $info['hasWikitext'] ),
			],
		];

		$form = HTMLForm::factory( 'ooui', $formDescriptor, $this->getContext() );
		$form->setSubmitTextMsg( 'infothequecore-options-save' );
		$form->setSubmitCallback( function ( array $data ) use ( $listId, $info ) {
			$entries = $this->parseEntries( $data['entries'], $info['hasWikitext'] );
			OptionListStore::replaceList( $listId, $entries );
			return true;
		} );

		if ( $form->show() ) {
			$out->addHTML( Html::successBox( $this->msg( 'infothequecore-options-saved' )->escaped() ) );
		}
	}

	/**
	 * @param list<array{key:string,label:string,wikitext:?string}> $entries
	 */
	private function serializeEntries( array $entries, bool $hasWikitext ): string {
		if ( !$hasWikitext ) {
			return implode( "\n", array_map( static fn ( array $e ): string => $e['label'], $entries ) );
		}
		return implode( "\n", array_map(
			static fn ( array $e ): string => $e['key'] . ' | ' . $e['label'] . ' | ' . $e['wikitext'],
			$entries
		) );
	}

	/**
	 * @return list<array{key:string,label:string,wikitext:?string}>
	 */
	private function parseEntries( string $raw, bool $hasWikitext ): array {
		$entries = [];
		foreach ( preg_split( '/\r?\n/', $raw ) as $line ) {
			$line = trim( $line );
			if ( $line === '' ) {
				continue;
			}
			if ( !$hasWikitext ) {
				$entries[] = [ 'key' => $line, 'label' => $line, 'wikitext' => null ];
				continue;
			}
			$parts = array_map( 'trim', explode( '|', $line, 3 ) );
			if ( count( $parts ) < 3 || $parts[0] === '' ) {
				continue; // malformed line, silently skipped rather than fatal
			}
			$entries[] = [ 'key' => $parts[0], 'label' => $parts[1], 'wikitext' => $parts[2] ];
		}
		return $entries;
	}

	/** @inheritDoc */
	protected function getGroupName() {
		return 'wiki';
	}
}
