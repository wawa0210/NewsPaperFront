

 


CKEDITOR.replaceClass = 'ckeditor';

( function() {
	
	CKEDITOR.replace = function( element, config ) {
		return createInstance( element, config, null, CKEDITOR.ELEMENT_MODE_REPLACE );
	};

	
	CKEDITOR.appendTo = function( element, config, data ) {
		return createInstance( element, config, data, CKEDITOR.ELEMENT_MODE_APPENDTO );
	};

	
	CKEDITOR.replaceAll = function() {
		var textareas = document.getElementsByTagName( 'textarea' );

		for ( var i = 0; i < textareas.length; i++ ) {
			var config = null,
				textarea = textareas[ i ];

			// The "name" and/or "id" attribute must exist.
			if ( !textarea.name && !textarea.id )
				continue;

			if ( typeof arguments[ 0 ] == 'string' ) {
				// The textarea class name could be passed as the function
				// parameter.

				var classRegex = new RegExp( '(?:^|\\s)' + arguments[ 0 ] + '(?:$|\\s)' );

				if ( !classRegex.test( textarea.className ) )
					continue;
			} else if ( typeof arguments[ 0 ] == 'function' ) {
				// An evaluation function could be passed as the function parameter.
				// It must explicitly return "false" to ignore a specific <textarea>.
				config = {};
				if ( arguments[ 0 ]( textarea, config ) === false )
					continue;
			}

			this.replace( textarea, config );
		}
	};

	

	
	CKEDITOR.editor.prototype.addMode = function( mode, exec ) {
		( this._.modes || ( this._.modes = {} ) )[ mode ] = exec;
	};

	
	CKEDITOR.editor.prototype.setMode = function( newMode, callback ) {
		var editor = this;

		var modes = this._.modes;

		// Mode loading quickly fails.
		if ( newMode == editor.mode || !modes || !modes[ newMode ] )
			return;

		editor.fire( 'beforeSetMode', newMode );

		if ( editor.mode ) {
			var isDirty = editor.checkDirty(),
				previousModeData = editor._.previousModeData,
				currentData,
				unlockSnapshot = 0;

			editor.fire( 'beforeModeUnload' );

			// Detach the current editable. While detaching editable will set
			// cached editor's data (with internal setData call). We use this
			// data below to avoid two getData() calls in a row.
			editor.editable( 0 );

			editor._.previousMode = editor.mode;
			// Get cached data, which was set while detaching editable.
			editor._.previousModeData = currentData = editor.getData( 1 );

			// If data has not been modified in the mode which we are currently leaving,
			// avoid making snapshot right after initializing new mode.
			// http://dev.ckeditor.com/ticket/5217#comment:20
			// Tested by:
			// 'test switch mode with unrecoreded, inner HTML specific content (boguses)'
			// 'test switch mode with unrecoreded, inner HTML specific content (boguses) plus changes in source mode'
			if ( editor.mode == 'source' && previousModeData == currentData ) {
				// We need to make sure that unlockSnapshot will update the last snapshot
				// (will not create new one) if lockSnapshot is not called on outdated snapshots stack.
				// Additionally, forceUpdate prevents from making content image now, which is useless
				// (because it equals editor data not inner HTML).
				editor.fire( 'lockSnapshot', { forceUpdate: true } );
				unlockSnapshot = 1;
			}

			// Clear up the mode space.
			editor.ui.space( 'contents' ).setHtml( '' );

			editor.mode = '';
		} else {
			editor._.previousModeData = editor.getData( 1 );
		}

		// Fire the mode handler.
		this._.modes[ newMode ]( function() {
			// Set the current mode.
			editor.mode = newMode;

			if ( isDirty !== undefined )
				!isDirty && editor.resetDirty();

			if ( unlockSnapshot )
				editor.fire( 'unlockSnapshot' );
			// Since snapshot made on dataReady (which normally catches changes done by setData)
			// won't work because editor.mode was not set yet (it's set in this function), we need
			// to make special snapshot for changes done in source mode here.
			else if ( newMode == 'wysiwyg' )
				editor.fire( 'saveSnapshot' );

			// Delay to avoid race conditions (setMode inside setMode).
			setTimeout( function() {
				editor.fire( 'mode' );
				callback && callback.call( editor );
			}, 0 );
		} );
	};

	
	CKEDITOR.editor.prototype.resize = function( width, height, isContentHeight, resizeInner ) {
		var container = this.container,
			contents = this.ui.space( 'contents' ),
			contentsFrame = CKEDITOR.env.webkit && this.document && this.document.getWindow().$.frameElement,
			outer;

		if ( resizeInner ) {
			outer = this.container.getFirst( function( node ) {
				return node.type == CKEDITOR.NODE_ELEMENT && node.hasClass( 'cke_inner' );
			} );
		} else {
			outer = container;
		}

		// Set as border box width. (#5353)
		outer.setSize( 'width', width, true );

		// WebKit needs to refresh the iframe size to avoid rendering issues. (1/2) (#8348)
		contentsFrame && ( contentsFrame.style.width = '1%' );

		// Get the height delta between the outer table and the content area.
		var contentsOuterDelta = ( outer.$.offsetHeight || 0 ) - ( contents.$.clientHeight || 0 ),

		// If we're setting the content area's height, then we don't need the delta.
			resultContentsHeight = Math.max( height - ( isContentHeight ? 0 : contentsOuterDelta ), 0 ),
			resultOuterHeight = ( isContentHeight ? height + contentsOuterDelta : height );

		contents.setStyle( 'height', resultContentsHeight + 'px' );

		// WebKit needs to refresh the iframe size to avoid rendering issues. (2/2) (#8348)
		contentsFrame && ( contentsFrame.style.width = '100%' );

		// Emit a resize event.
		this.fire( 'resize', {
			outerHeight: resultOuterHeight,
			contentsHeight: resultContentsHeight,
			// Sometimes width is not provided.
			outerWidth: width || outer.getSize( 'width' )
		} );
	};

	
	CKEDITOR.editor.prototype.getResizable = function( forContents ) {
		return forContents ? this.ui.space( 'contents' ) : this.container;
	};

	function createInstance( element, config, data, mode ) {
		if ( !CKEDITOR.env.isCompatible )
			return null;

		element = CKEDITOR.dom.element.get( element );

		// Avoid multiple inline editor instances on the same element.
		if ( element.getEditor() )
			throw 'The editor instance "' + element.getEditor().name + '" is already attached to the provided element.';

		// Create the editor instance.
		var editor = new CKEDITOR.editor( config, element, mode );

		if ( mode == CKEDITOR.ELEMENT_MODE_REPLACE ) {
			// Do not replace the textarea right now, just hide it. The effective
			// replacement will be done later in the editor creation lifecycle.
			element.setStyle( 'visibility', 'hidden' );

			// #8031 Remember if textarea was required and remove the attribute.
			editor._.required = element.hasAttribute( 'required' );
			element.removeAttribute( 'required' );
		}

		data && editor.setData( data, null, true );

		// Once the editor is loaded, start the UI.
		editor.on( 'loaded', function() {
			loadTheme( editor );

			if ( mode == CKEDITOR.ELEMENT_MODE_REPLACE && editor.config.autoUpdateElement && element.$.form )
				editor._attachToForm();

			editor.setMode( editor.config.startupMode, function() {
				// Clean on startup.
				editor.resetDirty();

				// Editor is completely loaded for interaction.
				editor.status = 'ready';
				editor.fireOnce( 'instanceReady' );
				CKEDITOR.fire( 'instanceReady', null, editor );
			} );
		} );

		editor.on( 'destroy', destroy );
		return editor;
	}

	function destroy() {
		var editor = this,
			container = editor.container,
			element = editor.element;

		if ( container ) {
			container.clearCustomData();
			container.remove();
		}

		if ( element ) {
			element.clearCustomData();
			if ( editor.elementMode == CKEDITOR.ELEMENT_MODE_REPLACE ) {
				element.show();
				if ( editor._.required )
					element.setAttribute( 'required', 'required' );
			}
			delete editor.element;
		}
	}

	function loadTheme( editor ) {
		var name = editor.name,
			element = editor.element,
			elementMode = editor.elementMode;

		// Get the HTML for the predefined spaces.
		var topHtml = editor.fire( 'uiSpace', { space: 'top', html: '' } ).html;
		var bottomHtml = editor.fire( 'uiSpace', { space: 'bottom', html: '' } ).html;

		var themedTpl = new CKEDITOR.template(
			'<{outerEl}' +
				' id="cke_{name}"' +
				' class="{id} cke cke_reset cke_chrome cke_editor_{name} cke_{langDir} ' + CKEDITOR.env.cssClass + '" ' +
				' dir="{langDir}"' +
				' lang="{langCode}"' +
				' role="application"' +
				( editor.title ? ' aria-labelledby="cke_{name}_arialbl"' : '' ) +
				'>' +
				( editor.title ? '<span id="cke_{name}_arialbl" class="cke_voice_label">{voiceLabel}</span>' : '' ) +
				'<{outerEl} class="cke_inner cke_reset" role="presentation">' +
					'{topHtml}' +
					'<{outerEl} id="{contentId}" class="cke_contents cke_reset" role="presentation"></{outerEl}>' +
					'{bottomHtml}' +
				'</{outerEl}>' +
			'</{outerEl}>' );

		var container = CKEDITOR.dom.element.createFromHtml( themedTpl.output( {
			id: editor.id,
			name: name,
			langDir: editor.lang.dir,
			langCode: editor.langCode,
			voiceLabel: editor.title,
			topHtml: topHtml ? '<span id="' + editor.ui.spaceId( 'top' ) + '" class="cke_top cke_reset_all" role="presentation" style="height:auto">' + topHtml + '</span>' : '',
			contentId: editor.ui.spaceId( 'contents' ),
			bottomHtml: bottomHtml ? '<span id="' + editor.ui.spaceId( 'bottom' ) + '" class="cke_bottom cke_reset_all" role="presentation">' + bottomHtml + '</span>' : '',
			outerEl: CKEDITOR.env.ie ? 'span' : 'div'	// #9571
		} ) );

		if ( elementMode == CKEDITOR.ELEMENT_MODE_REPLACE ) {
			element.hide();
			container.insertAfter( element );
		} else {
			element.append( container );
		}

		editor.container = container;
		editor.ui.contentsElement = editor.ui.space( 'contents' );

		// Make top and bottom spaces unelectable, but not content space,
		// otherwise the editable area would be affected.
		topHtml && editor.ui.space( 'top' ).unselectable();
		bottomHtml && editor.ui.space( 'bottom' ).unselectable();

		var width = editor.config.width, height = editor.config.height;
		if ( width )
			container.setStyle( 'width', CKEDITOR.tools.cssLength( width ) );

		// The editor height is applied to the contents space.
		if ( height )
			editor.ui.space( 'contents' ).setStyle( 'height', CKEDITOR.tools.cssLength( height ) );

		// Disable browser context menu for editor's chrome.
		container.disableContextMenu();

		// Redirect the focus into editor for webkit. (#5713)
		CKEDITOR.env.webkit && container.on( 'focus', function() {
			editor.focus();
		} );

		editor.fireOnce( 'uiReady' );
	}

	// Replace all textareas with the default class name.
	CKEDITOR.domReady( function() {
		CKEDITOR.replaceClass && CKEDITOR.replaceAll( CKEDITOR.replaceClass );
	} );
} )();




CKEDITOR.config.startupMode = 'wysiwyg';










