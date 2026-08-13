<?php

namespace MediaWiki\Extension\InfothequeCore;

use HTMLForm;
use SpecialPage;

/**
 * Entry point of the InfothèqueCore assistant: lets the user pick which
 * kind of table (Téléchargements logiciels/jeux, Manuels, Configurations,
 * Pilotes) they want to add or edit. Dispatch to the schema-driven
 * sub-forms is added in a later phase.
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

		$formDescriptor = [
			'formType' => [
				'type' => 'select',
				'label-message' => 'infothequecore-select-form-label',
				'help-message' => 'infothequecore-select-form-help',
				'options-messages' => [
					'infothequecore-form-telechargements-logiciels' => 'telechargements-logiciels',
					'infothequecore-form-manuels' => 'manuels',
					'infothequecore-form-configurations' => 'configurations',
					'infothequecore-form-pilotes' => 'pilotes',
				],
			],
		];

		$form = HTMLForm::factory( 'ooui', $formDescriptor, $this->getContext() );
		$form->setSubmitTextMsg( 'infothequecore-select-form-submit' );
		$form->setSubmitCallback( [ $this, 'onFormSubmit' ] );
		$form->show();
	}

	/**
	 * @param array $data
	 * @return true
	 */
	public function onFormSubmit( array $data ) {
		return true;
	}

	/** @inheritDoc */
	protected function getGroupName() {
		return 'wiki';
	}
}
