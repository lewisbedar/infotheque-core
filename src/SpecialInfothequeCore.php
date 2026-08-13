<?php

namespace MediaWiki\Extension\InfothequeCore;

use HTMLForm;
use MediaWiki\CommentStore\CommentStoreComment;
use MediaWiki\Content\WikitextContent;
use MediaWiki\Extension\InfothequeCore\Generator\Validator;
use MediaWiki\Extension\InfothequeCore\Generator\WikitextGenerator;
use MediaWiki\Extension\InfothequeCore\Schema\FieldDefinition;
use MediaWiki\Extension\InfothequeCore\Schema\FieldWidget;
use MediaWiki\Extension\InfothequeCore\Schema\FormSchema;
use MediaWiki\Extension\InfothequeCore\Schema\SchemaRegistry;
use MediaWiki\Html\Html;
use MediaWiki\Linker\Linker;
use MediaWiki\MediaWikiServices;
use MediaWiki\Parser\ParserOptions;
use MediaWiki\Revision\SlotRecord;
use MediaWiki\Title\Title;
use SpecialPage;

/**
 * Entry point of the InfothèqueCore assistant.
 *
 * Special:InfothequeCore shows the content-type selector; each schema in
 * SchemaRegistry gets its own subpage (e.g. Special:InfothequeCore/pilotes)
 * with a three-step flow: fill in the form, preview the generated wikitext
 * (rendered + raw) and the target page, then confirm to publish. Writing
 * only happens for pages that don't exist yet — if the target page already
 * exists, the wikitext is shown for manual copy/paste instead, since v1
 * doesn't merge into existing content.
 */
class SpecialInfothequeCore extends SpecialPage {

	public function __construct() {
		parent::__construct( 'InfothequeCore' );
	}

	/** @inheritDoc */
	public function execute( $subPage ) {
		$this->setHeaders();
		$this->outputHeader();
		$this->requireNamedUser();
		$this->getOutput()->addModules( 'ext.infothequeCore.special' );

		if ( $subPage === null || $subPage === '' ) {
			$this->showSelector();
			return;
		}

		$schema = SchemaRegistry::get( $subPage );
		if ( $schema === null ) {
			$this->getOutput()->addHTML( Html::errorBox( $this->msg( 'infothequecore-unknown-form' )->escaped() ) );
			$this->showSelector();
			return;
		}

		$this->getOutput()->addSubtitle(
			Linker::link( $this->getPageTitle(), $this->msg( 'infothequecore-back-to-selector' )->text() )
		);

		$request = $this->getRequest();
		if ( $request->wasPosted() && $request->getVal( 'ithcStage' ) === 'confirm' ) {
			$this->handleConfirm( $schema );
			return;
		}

		$this->showEditForm( $schema );
	}

	private function showSelector(): void {
		$options = [];
		foreach ( SchemaRegistry::all() as $id => $schema ) {
			$options[ $this->msg( $schema->labelMsg )->text() ] = $id;
		}

		$formDescriptor = [
			'formType' => [
				'type' => 'select',
				'label-message' => 'infothequecore-select-form-label',
				'help-message' => 'infothequecore-select-form-help',
				'options' => $options,
			],
		];

		$form = HTMLForm::factory( 'ooui', $formDescriptor, $this->getContext() );
		$form->setSubmitTextMsg( 'infothequecore-select-form-submit' );
		$form->setSubmitCallback( function ( array $data ) {
			$this->getOutput()->redirect( $this->getPageTitle( $data['formType'] )->getLocalURL() );
			return true;
		} );
		$form->show();
	}

	private function showEditForm( FormSchema $schema ): void {
		$formDescriptor = [
			'targetPage' => [
				'type' => 'title',
				'label-message' => 'infothequecore-field-target-page',
				'help-message' => 'infothequecore-field-target-page-help',
				'required' => true,
			],
		];

		foreach ( $schema->titleFields as $field ) {
			$formDescriptor[ $field->key ] = $this->fieldDescriptor( $field );
		}

		for ( $slot = 1; $slot <= WikitextGenerator::MAX_ROWS; $slot++ ) {
			$formDescriptor[ 'row' . $slot . '_heading' ] = [
				'type' => 'info',
				'default' => $this->msg( 'infothequecore-row-section', $slot )->text(),
			];
			foreach ( $schema->rowFields as $field ) {
				$desc = $this->fieldDescriptor( $field );
				// Requiredness is enforced by Validator only for rows actually
				// filled in — most row slots are legitimately left empty.
				$desc['required'] = false;
				$formDescriptor[ 'row' . $slot . '_' . $field->key ] = $desc;
			}
		}

		$form = HTMLForm::factory( 'ooui', $formDescriptor, $this->getContext() );
		$form->setId( 'ithc-edit-form' );
		$form->setSubmitTextMsg( 'infothequecore-preview-button' );
		$form->setSubmitCallback( function ( array $data ) use ( $schema ) {
			$validator = new Validator();
			$errors = array_filter(
				$validator->validate( $schema, $data ),
				static fn ( $m ) => $m->severity === 'error'
			);
			if ( $errors !== [] ) {
				return array_map( static fn ( $m ) => $m->text, $errors );
			}
			$this->renderPreview( $schema, $data );
			return true;
		} );
		$form->show();
	}

	private function fieldDescriptor( FieldDefinition $field ): array {
		$desc = [
			'label-message' => $field->labelMsg,
		];
		if ( $field->helpMsg !== null ) {
			$desc['help-message'] = $field->helpMsg;
		}
		if ( $field->example !== null ) {
			$desc['placeholder'] = $field->example;
		}
		switch ( $field->widget ) {
			case FieldWidget::Textarea:
				$desc['type'] = 'textarea';
				$desc['rows'] = 3;
				break;
			case FieldWidget::Combobox:
				$desc['type'] = 'combobox';
				$desc['options'] = array_combine( $field->suggestedValues, $field->suggestedValues );
				break;
			case FieldWidget::Text:
			case FieldWidget::File:
			default:
				$desc['type'] = 'text';
				break;
		}
		return $desc;
	}

	private function renderPreview( FormSchema $schema, array $data ): void {
		$out = $this->getOutput();
		$generator = new WikitextGenerator();
		$wikitext = $generator->generate( $schema, $data );

		$targetTitle = Title::newFromText( $data['targetPage'] ?? '' );
		if ( $targetTitle === null ) {
			$out->addHTML( Html::errorBox( $this->msg( 'infothequecore-invalid-target-page' )->escaped() ) );
			return;
		}

		$parserOutput = MediaWikiServices::getInstance()->getParserFactory()->create()->parse(
			$wikitext,
			$targetTitle,
			ParserOptions::newFromContext( $this->getContext() )
		);

		$out->addHTML( Html::element( 'h2', [], $this->msg( 'infothequecore-preview-heading' )->text() ) );
		$out->addHTML( Html::rawElement( 'div', [ 'class' => 'ithc-preview-rendered' ], $parserOutput->getText() ) );
		$out->addHTML( Html::element( 'h3', [], $this->msg( 'infothequecore-preview-wikitext-heading' )->text() ) );
		$out->addHTML( Html::element( 'pre', [ 'class' => 'ithc-preview-wikitext' ], $wikitext ) );

		if ( $targetTitle->exists() ) {
			$out->addHTML( Html::warningBox(
				$this->msg( 'infothequecore-page-exists-warning', $targetTitle->getPrefixedText() )->parse()
			) );
			return;
		}

		$out->addHTML( Html::openElement( 'form', [
			'method' => 'post',
			'action' => $this->getPageTitle( $schema->id )->getLocalURL(),
		] ) );
		$out->addHTML( Html::hidden( 'ithcStage', 'confirm' ) );
		$out->addHTML( Html::hidden( 'ithcTargetPage', $targetTitle->getPrefixedText() ) );
		$out->addHTML( Html::hidden( 'ithcWikitext', $wikitext ) );
		$out->addHTML( Html::hidden( 'wpEditToken', $this->getUser()->getEditToken() ) );
		$out->addHTML( Html::submitButton(
			$this->msg( 'infothequecore-publish-button' )->text(),
			[ 'class' => 'mw-ui-button mw-ui-progressive' ]
		) );
		$out->addHTML( Html::closeElement( 'form' ) );
	}

	private function handleConfirm( FormSchema $schema ): void {
		$out = $this->getOutput();
		$request = $this->getRequest();

		if ( !$this->getUser()->matchEditToken( $request->getVal( 'wpEditToken' ) ) ) {
			$out->addHTML( Html::errorBox( $this->msg( 'infothequecore-bad-token' )->escaped() ) );
			return;
		}

		$targetTitle = Title::newFromText( $request->getVal( 'ithcTargetPage', '' ) );
		$wikitext = $request->getText( 'ithcWikitext', '' );

		if ( $targetTitle === null || $wikitext === '' ) {
			$out->addHTML( Html::errorBox( $this->msg( 'infothequecore-confirm-missing-data' )->escaped() ) );
			return;
		}

		if ( $targetTitle->exists() ) {
			// The page appeared between preview and confirm; v1 never merges.
			$out->addHTML( Html::warningBox(
				$this->msg( 'infothequecore-page-exists-warning', $targetTitle->getPrefixedText() )->parse()
			) );
			$out->addHTML( Html::element( 'pre', [ 'class' => 'ithc-preview-wikitext' ], $wikitext ) );
			return;
		}

		$wikiPage = MediaWikiServices::getInstance()->getWikiPageFactory()->newFromTitle( $targetTitle );
		$updater = $wikiPage->newPageUpdater( $this->getUser() );
		$updater->setContent( SlotRecord::MAIN, new WikitextContent( $wikitext ) );
		$updater->saveRevision(
			CommentStoreComment::newUnsavedComment( $this->msg( 'infothequecore-edit-summary' )->text() ),
			EDIT_NEW
		);

		if ( !$updater->wasSuccessful() ) {
			$out->addHTML( Html::errorBox( $this->msg( 'infothequecore-save-failed' )->escaped() ) );
			return;
		}

		$out->addHTML( Html::successBox(
			$this->msg( 'infothequecore-save-success', $targetTitle->getPrefixedText() )->parse()
		) );
		$out->addHTML( Linker::link( $targetTitle, $this->msg( 'infothequecore-view-page' )->text() ) );
	}

	/** @inheritDoc */
	protected function getGroupName() {
		return 'wiki';
	}
}
