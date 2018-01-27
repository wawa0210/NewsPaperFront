



CKEDITOR.plugins.add( 'dialogui', {
	onLoad: function() {

		var initPrivateObject = function( elementDefinition ) {
				this._ || ( this._ = {} );
				this._[ 'default' ] = this._.initValue = elementDefinition[ 'default' ] || '';
				this._.required = elementDefinition.required || false;
				var args = [ this._ ];
				for ( var i = 1; i < arguments.length; i++ )
					args.push( arguments[ i ] );
				args.push( true );
				CKEDITOR.tools.extend.apply( CKEDITOR.tools, args );
				return this._;
			},
			textBuilder = {
				build: function( dialog, elementDefinition, output ) {
					return new CKEDITOR.ui.dialog.textInput( dialog, elementDefinition, output );
				}
			},
			commonBuilder = {
				build: function( dialog, elementDefinition, output ) {
					return new CKEDITOR.ui.dialog[ elementDefinition.type ]( dialog, elementDefinition, output );
				}
			},
			containerBuilder = {
				build: function( dialog, elementDefinition, output ) {
					var children = elementDefinition.children,
						child,
						childHtmlList = [],
						childObjList = [];
					for ( var i = 0;
					( i < children.length && ( child = children[ i ] ) ); i++ ) {
						var childHtml = [];
						childHtmlList.push( childHtml );
						childObjList.push( CKEDITOR.dialog._.uiElementBuilders[ child.type ].build( dialog, child, childHtml ) );
					}
					return new CKEDITOR.ui.dialog[ elementDefinition.type ]( dialog, childObjList, childHtmlList, output, elementDefinition );
				}
			},
			commonPrototype = {
				isChanged: function() {
					return this.getValue() != this.getInitValue();
				},

				reset: function( noChangeEvent ) {
					this.setValue( this.getInitValue(), noChangeEvent );
				},

				setInitValue: function() {
					this._.initValue = this.getValue();
				},

				resetInitValue: function() {
					this._.initValue = this._[ 'default' ];
				},

				getInitValue: function() {
					return this._.initValue;
				}
			},
			commonEventProcessors = CKEDITOR.tools.extend( {}, CKEDITOR.ui.dialog.uiElement.prototype.eventProcessors, {
				onChange: function( dialog, func ) {
					if ( !this._.domOnChangeRegistered ) {
						dialog.on( 'load', function() {
							this.getInputElement().on( 'change', function() {
								// Make sure 'onchange' doesn't get fired after dialog closed. (#5719)
								if ( !dialog.parts.dialog.isVisible() )
									return;

								this.fire( 'change', { value: this.getValue() } );
							}, this );
						}, this );
						this._.domOnChangeRegistered = true;
					}

					this.on( 'change', func );
				}
			}, true ),
			eventRegex = /^on([A-Z]\w+)/,
			cleanInnerDefinition = function( def ) {
				// An inner UI element should not have the parent's type, title or events.
				for ( var i in def ) {
					if ( eventRegex.test( i ) || i == 'title' || i == 'type' )
						delete def[ i ];
				}
				return def;
			},
			// @context {CKEDITOR.dialog.uiElement} UI element (textarea or textInput)
			// @param {CKEDITOR.dom.event} evt
			toggleBidiKeyUpHandler = function( evt ) {
				var keystroke = evt.data.getKeystroke();

				// ALT + SHIFT + Home for LTR direction.
				if ( keystroke == CKEDITOR.SHIFT + CKEDITOR.ALT + 36 )
					this.setDirectionMarker( 'ltr' );

				// ALT + SHIFT + End for RTL direction.
				else if ( keystroke == CKEDITOR.SHIFT + CKEDITOR.ALT + 35 )
					this.setDirectionMarker( 'rtl' );
			};

		CKEDITOR.tools.extend( CKEDITOR.ui.dialog, {
			
			labeledElement: function( dialog, elementDefinition, htmlList, contentHtml ) {
				if ( arguments.length < 4 )
					return;

				var _ = initPrivateObject.call( this, elementDefinition );
				_.labelId = CKEDITOR.tools.getNextId() + '_label';
				this._.children = [];

				var innerHTML = function() {
						var html = [],
							requiredClass = elementDefinition.required ? ' cke_required' : '';
						if ( elementDefinition.labelLayout != 'horizontal' ) {
							html.push(
								'<label class="cke_dialog_ui_labeled_label' + requiredClass + '" ', ' id="' + _.labelId + '"',
									( _.inputId ? ' for="' + _.inputId + '"' : '' ),
									( elementDefinition.labelStyle ? ' style="' + elementDefinition.labelStyle + '"' : '' ) + '>',
									elementDefinition.label,
								'</label>',
								'<div class="cke_dialog_ui_labeled_content"',
									( elementDefinition.controlStyle ? ' style="' + elementDefinition.controlStyle + '"' : '' ),
									' role="presentation">',
									contentHtml.call( this, dialog, elementDefinition ),
								'</div>' );
						} else {
							var hboxDefinition = {
								type: 'hbox',
								widths: elementDefinition.widths,
								padding: 0,
								children: [ {
									type: 'html',
									html: '<label class="cke_dialog_ui_labeled_label' + requiredClass + '"' +
										' id="' + _.labelId + '"' +
										' for="' + _.inputId + '"' +
										( elementDefinition.labelStyle ? ' style="' + elementDefinition.labelStyle + '"' : '' ) + '>' +
											CKEDITOR.tools.htmlEncode( elementDefinition.label ) +
										'</label>'
								},
								{
									type: 'html',
									html: '<span class="cke_dialog_ui_labeled_content"' + ( elementDefinition.controlStyle ? ' style="' + elementDefinition.controlStyle + '"' : '' ) + '>' +
										contentHtml.call( this, dialog, elementDefinition ) +
										'</span>'
								} ]
							};
							CKEDITOR.dialog._.uiElementBuilders.hbox.build( dialog, hboxDefinition, html );
						}
						return html.join( '' );
					};
				var attributes = { role: elementDefinition.role || 'presentation' };

				if ( elementDefinition.includeLabel )
					attributes[ 'aria-labelledby' ] = _.labelId;

				CKEDITOR.ui.dialog.uiElement.call( this, dialog, elementDefinition, htmlList, 'div', null, attributes, innerHTML );
			},

			
			textInput: function( dialog, elementDefinition, htmlList ) {
				if ( arguments.length < 3 )
					return;

				initPrivateObject.call( this, elementDefinition );
				var domId = this._.inputId = CKEDITOR.tools.getNextId() + '_textInput',
					attributes = { 'class': 'cke_dialog_ui_input_' + elementDefinition.type, id: domId, type: elementDefinition.type };

				// Set the validator, if any.
				if ( elementDefinition.validate )
					this.validate = elementDefinition.validate;

				// Set the max length and size.
				if ( elementDefinition.maxLength )
					attributes.maxlength = elementDefinition.maxLength;
				if ( elementDefinition.size )
					attributes.size = elementDefinition.size;

				if ( elementDefinition.inputStyle )
					attributes.style = elementDefinition.inputStyle;

				// If user presses Enter in a text box, it implies clicking OK for the dialog.
				var me = this,
					keyPressedOnMe = false;
				dialog.on( 'load', function() {
					me.getInputElement().on( 'keydown', function( evt ) {
						if ( evt.data.getKeystroke() == 13 )
							keyPressedOnMe = true;
					} );

					// Lower the priority this 'keyup' since 'ok' will close the dialog.(#3749)
					me.getInputElement().on( 'keyup', function( evt ) {
						if ( evt.data.getKeystroke() == 13 && keyPressedOnMe ) {
							dialog.getButton( 'ok' ) && setTimeout( function() {
								dialog.getButton( 'ok' ).click();
							}, 0 );
							keyPressedOnMe = false;
						}

						if ( me.bidi )
							toggleBidiKeyUpHandler.call( me, evt );
					}, null, null, 1000 );
				} );

				var innerHTML = function() {
						// IE BUG: Text input fields in IE at 100% would exceed a <td> or inline
						// container's width, so need to wrap it inside a <div>.
						var html = [ '<div class="cke_dialog_ui_input_', elementDefinition.type, '" role="presentation"' ];

						if ( elementDefinition.width )
							html.push( 'style="width:' + elementDefinition.width + '" ' );

						html.push( '><input ' );

						attributes[ 'aria-labelledby' ] = this._.labelId;
						this._.required && ( attributes[ 'aria-required' ] = this._.required );
						for ( var i in attributes )
							html.push( i + '="' + attributes[ i ] + '" ' );
						html.push( ' /></div>' );
						return html.join( '' );
					};
				CKEDITOR.ui.dialog.labeledElement.call( this, dialog, elementDefinition, htmlList, innerHTML );
			},

			
			textarea: function( dialog, elementDefinition, htmlList ) {
				if ( arguments.length < 3 )
					return;

				initPrivateObject.call( this, elementDefinition );
				var me = this,
					domId = this._.inputId = CKEDITOR.tools.getNextId() + '_textarea',
					attributes = {};

				if ( elementDefinition.validate )
					this.validate = elementDefinition.validate;

				// Generates the essential attributes for the textarea tag.
				attributes.rows = elementDefinition.rows || 5;
				attributes.cols = elementDefinition.cols || 20;

				attributes[ 'class' ] = 'cke_dialog_ui_input_textarea ' + ( elementDefinition[ 'class' ] || '' );

				if ( typeof elementDefinition.inputStyle != 'undefined' )
					attributes.style = elementDefinition.inputStyle;

				if ( elementDefinition.dir )
					attributes.dir = elementDefinition.dir;

				if ( me.bidi ) {
					dialog.on( 'load', function() {
						me.getInputElement().on( 'keyup', toggleBidiKeyUpHandler );
					}, me );
				}

				var innerHTML = function() {
						attributes[ 'aria-labelledby' ] = this._.labelId;
						this._.required && ( attributes[ 'aria-required' ] = this._.required );
						var html = [ '<div class="cke_dialog_ui_input_textarea" role="presentation"><textarea id="', domId, '" ' ];
						for ( var i in attributes )
							html.push( i + '="' + CKEDITOR.tools.htmlEncode( attributes[ i ] ) + '" ' );
						html.push( '>', CKEDITOR.tools.htmlEncode( me._[ 'default' ] ), '</textarea></div>' );
						return html.join( '' );
					};
				CKEDITOR.ui.dialog.labeledElement.call( this, dialog, elementDefinition, htmlList, innerHTML );
			},

			
			checkbox: function( dialog, elementDefinition, htmlList ) {
				if ( arguments.length < 3 )
					return;

				var _ = initPrivateObject.call( this, elementDefinition, { 'default': !!elementDefinition[ 'default' ] } );

				if ( elementDefinition.validate )
					this.validate = elementDefinition.validate;

				var innerHTML = function() {
						var myDefinition = CKEDITOR.tools.extend(
								{},
								elementDefinition,
								{
									id: elementDefinition.id ? elementDefinition.id + '_checkbox' : CKEDITOR.tools.getNextId() + '_checkbox'
								},
								true
							),
							html = [];

						var labelId = CKEDITOR.tools.getNextId() + '_label';
						var attributes = { 'class': 'cke_dialog_ui_checkbox_input', type: 'checkbox', 'aria-labelledby': labelId };
						cleanInnerDefinition( myDefinition );
						if ( elementDefinition[ 'default' ] )
							attributes.checked = 'checked';

						if ( typeof myDefinition.inputStyle != 'undefined' )
							myDefinition.style = myDefinition.inputStyle;

						_.checkbox = new CKEDITOR.ui.dialog.uiElement( dialog, myDefinition, html, 'input', null, attributes );
						html.push(
							' <label id="',
							labelId,
							'" for="',
							attributes.id,
							'"' + ( elementDefinition.labelStyle ? ' style="' + elementDefinition.labelStyle + '"' : '' ) + '>',
							CKEDITOR.tools.htmlEncode( elementDefinition.label ),
							'</label>'
						);
						return html.join( '' );
					};

				CKEDITOR.ui.dialog.uiElement.call( this, dialog, elementDefinition, htmlList, 'span', null, null, innerHTML );
			},

			
			radio: function( dialog, elementDefinition, htmlList ) {
				if ( arguments.length < 3 )
					return;

				initPrivateObject.call( this, elementDefinition );

				if ( !this._[ 'default' ] )
					this._[ 'default' ] = this._.initValue = elementDefinition.items[ 0 ][ 1 ];

				if ( elementDefinition.validate )
					this.validate = elementDefinition.validate;

				var children = [],
					me = this;

				var innerHTML = function() {
					var inputHtmlList = [],
						html = [],
						commonName = ( elementDefinition.id ? elementDefinition.id : CKEDITOR.tools.getNextId() ) + '_radio';

					for ( var i = 0; i < elementDefinition.items.length; i++ ) {
						var item = elementDefinition.items[ i ],
							title = item[ 2 ] !== undefined ? item[ 2 ] : item[ 0 ],
							value = item[ 1 ] !== undefined ? item[ 1 ] : item[ 0 ],
							inputId = CKEDITOR.tools.getNextId() + '_radio_input',
							labelId = inputId + '_label',

							inputDefinition = CKEDITOR.tools.extend( {}, elementDefinition, {
								id: inputId,
								title: null,
								type: null
							}, true ),

							labelDefinition = CKEDITOR.tools.extend( {}, inputDefinition, {
								title: title
							}, true ),

							inputAttributes = {
								type: 'radio',
								'class': 'cke_dialog_ui_radio_input',
								name: commonName,
								value: value,
								'aria-labelledby': labelId
							},

							inputHtml = [];

						if ( me._[ 'default' ] == value )
							inputAttributes.checked = 'checked';

						cleanInnerDefinition( inputDefinition );
						cleanInnerDefinition( labelDefinition );

						if ( typeof inputDefinition.inputStyle != 'undefined' )
							inputDefinition.style = inputDefinition.inputStyle;

						// Make inputs of radio type focusable (#10866).
						inputDefinition.keyboardFocusable = true;

						children.push( new CKEDITOR.ui.dialog.uiElement( dialog, inputDefinition, inputHtml, 'input', null, inputAttributes ) );

						inputHtml.push( ' ' );

						new CKEDITOR.ui.dialog.uiElement( dialog, labelDefinition, inputHtml, 'label', null, {
							id: labelId,
							'for': inputAttributes.id
						}, item[ 0 ] );

						inputHtmlList.push( inputHtml.join( '' ) );
					}

					new CKEDITOR.ui.dialog.hbox( dialog, children, inputHtmlList, html );

					return html.join( '' );
				};

				// Adding a role="radiogroup" to definition used for wrapper.
				elementDefinition.role = 'radiogroup';
				elementDefinition.includeLabel = true;

				CKEDITOR.ui.dialog.labeledElement.call( this, dialog, elementDefinition, htmlList, innerHTML );
				this._.children = children;
			},

			
			button: function( dialog, elementDefinition, htmlList ) {
				if ( !arguments.length )
					return;

				if ( typeof elementDefinition == 'function' )
					elementDefinition = elementDefinition( dialog.getParentEditor() );

				initPrivateObject.call( this, elementDefinition, { disabled: elementDefinition.disabled || false } );

				// Add OnClick event to this input.
				CKEDITOR.event.implementOn( this );

				var me = this;

				// Register an event handler for processing button clicks.
				dialog.on( 'load', function() {
					var element = this.getElement();

					( function() {
						element.on( 'click', function( evt ) {
							me.click();
							// #9958
							evt.data.preventDefault();
						} );

						element.on( 'keydown', function( evt ) {
							if ( evt.data.getKeystroke() in { 32: 1 } ) {
								me.click();
								evt.data.preventDefault();
							}
						} );
					} )();

					element.unselectable();
				}, this );

				var outerDefinition = CKEDITOR.tools.extend( {}, elementDefinition );
				delete outerDefinition.style;

				var labelId = CKEDITOR.tools.getNextId() + '_label';
				CKEDITOR.ui.dialog.uiElement.call( this, dialog, outerDefinition, htmlList, 'a', null, {
					style: elementDefinition.style,
					href: 'javascript:void(0)', // jshint ignore:line
					title: elementDefinition.label,
					hidefocus: 'true',
					'class': elementDefinition[ 'class' ],
					role: 'button',
					'aria-labelledby': labelId
				}, '<span id="' + labelId + '" class="cke_dialog_ui_button">' +
											CKEDITOR.tools.htmlEncode( elementDefinition.label ) +
										'</span>' );
			},

			
			select: function( dialog, elementDefinition, htmlList ) {
				if ( arguments.length < 3 )
					return;

				var _ = initPrivateObject.call( this, elementDefinition );

				if ( elementDefinition.validate )
					this.validate = elementDefinition.validate;

				_.inputId = CKEDITOR.tools.getNextId() + '_select';

				var innerHTML = function() {
						var myDefinition = CKEDITOR.tools.extend(
								{},
								elementDefinition,
								{
									id: ( elementDefinition.id ? elementDefinition.id + '_select' : CKEDITOR.tools.getNextId() + '_select' )
								},
								true
							),
							html = [],
							innerHTML = [],
							attributes = { 'id': _.inputId, 'class': 'cke_dialog_ui_input_select', 'aria-labelledby': this._.labelId };

						html.push( '<div class="cke_dialog_ui_input_', elementDefinition.type, '" role="presentation"' );
						if ( elementDefinition.width )
							html.push( 'style="width:' + elementDefinition.width + '" ' );
						html.push( '>' );

						// Add multiple and size attributes from element definition.
						if ( elementDefinition.size !== undefined )
							attributes.size = elementDefinition.size;
						if ( elementDefinition.multiple !== undefined )
							attributes.multiple = elementDefinition.multiple;

						cleanInnerDefinition( myDefinition );
						for ( var i = 0, item; i < elementDefinition.items.length && ( item = elementDefinition.items[ i ] ); i++ ) {
							innerHTML.push( '<option value="', CKEDITOR.tools.htmlEncode( item[ 1 ] !== undefined ? item[ 1 ] : item[ 0 ] ).replace( /"/g, '&quot;' ), '" /> ', CKEDITOR.tools.htmlEncode( item[ 0 ] ) );
						}

						if ( typeof myDefinition.inputStyle != 'undefined' )
							myDefinition.style = myDefinition.inputStyle;

						_.select = new CKEDITOR.ui.dialog.uiElement( dialog, myDefinition, html, 'select', null, attributes, innerHTML.join( '' ) );

						html.push( '</div>' );

						return html.join( '' );
					};

				CKEDITOR.ui.dialog.labeledElement.call( this, dialog, elementDefinition, htmlList, innerHTML );
			},

			
			file: function( dialog, elementDefinition, htmlList ) {
				if ( arguments.length < 3 )
					return;

				if ( elementDefinition[ 'default' ] === undefined )
					elementDefinition[ 'default' ] = '';

				var _ = CKEDITOR.tools.extend( initPrivateObject.call( this, elementDefinition ), { definition: elementDefinition, buttons: [] } );

				if ( elementDefinition.validate )
					this.validate = elementDefinition.validate;

				
				var innerHTML = function() {
					_.frameId = CKEDITOR.tools.getNextId() + '_fileInput';

					var html = [
						'<iframe' +
							' frameborder="0"' +
							' allowtransparency="0"' +
							' class="cke_dialog_ui_input_file"' +
							' role="presentation"' +
							' id="', _.frameId, '"' +
							' title="', elementDefinition.label, '"' +
							' src="javascript:void('
					];

					// Support for custom document.domain on IE. (#10165)
					html.push( CKEDITOR.env.ie ?
						'(function(){' + encodeURIComponent(
							'document.open();' +
							'(' + CKEDITOR.tools.fixDomain + ')();' +
							'document.close();'
						) + '})()'
						:
						'0'
					);

					html.push( ')"></iframe>' );

					return html.join( '' );
				};

				// IE BUG: Parent container does not resize to contain the iframe automatically.
				dialog.on( 'load', function() {
					var iframe = CKEDITOR.document.getById( _.frameId ),
						contentDiv = iframe.getParent();
					contentDiv.addClass( 'cke_dialog_ui_input_file' );
				} );

				CKEDITOR.ui.dialog.labeledElement.call( this, dialog, elementDefinition, htmlList, innerHTML );
			},

			
			fileButton: function( dialog, elementDefinition, htmlList ) {
				var me = this;
				if ( arguments.length < 3 )
					return;

				initPrivateObject.call( this, elementDefinition );

				if ( elementDefinition.validate )
					this.validate = elementDefinition.validate;

				var myDefinition = CKEDITOR.tools.extend( {}, elementDefinition );
				var onClick = myDefinition.onClick;
				myDefinition.className = ( myDefinition.className ? myDefinition.className + ' ' : '' ) + 'cke_dialog_ui_button';
				myDefinition.onClick = function( evt ) {
					var target = elementDefinition[ 'for' ]; // [ pageId, elementId ]
					if ( !onClick || onClick.call( this, evt ) !== false ) {
						dialog.getContentElement( target[ 0 ], target[ 1 ] ).submit();
						this.disable();
					}
				};

				dialog.on( 'load', function() {
					dialog.getContentElement( elementDefinition[ 'for' ][ 0 ], elementDefinition[ 'for' ][ 1 ] )._.buttons.push( me );
				} );

				CKEDITOR.ui.dialog.button.call( this, dialog, myDefinition, htmlList );
			},

			html: ( function() {
				var myHtmlRe = /^\s*<[\w:]+\s+([^>]*)?>/,
					theirHtmlRe = /^(\s*<[\w:]+(?:\s+[^>]*)?)((?:.|\r|\n)+)$/,
					emptyTagRe = /\/$/;
				
				return function( dialog, elementDefinition, htmlList ) {
					if ( arguments.length < 3 )
						return;

					var myHtmlList = [],
						myHtml,
						theirHtml = elementDefinition.html,
						myMatch, theirMatch;

					// If the HTML input doesn't contain any tags at the beginning, add a <span> tag around it.
					if ( theirHtml.charAt( 0 ) != '<' )
						theirHtml = '<span>' + theirHtml + '</span>';

					// Look for focus function in definition.
					var focus = elementDefinition.focus;
					if ( focus ) {
						var oldFocus = this.focus;
						this.focus = function() {
							( typeof focus == 'function' ? focus : oldFocus ).call( this );
							this.fire( 'focus' );
						};
						if ( elementDefinition.isFocusable ) {
							var oldIsFocusable = this.isFocusable;
							this.isFocusable = oldIsFocusable;
						}
						this.keyboardFocusable = true;
					}

					CKEDITOR.ui.dialog.uiElement.call( this, dialog, elementDefinition, myHtmlList, 'span', null, null, '' );

					// Append the attributes created by the uiElement call to the real HTML.
					myHtml = myHtmlList.join( '' );
					myMatch = myHtml.match( myHtmlRe );
					theirMatch = theirHtml.match( theirHtmlRe ) || [ '', '', '' ];

					if ( emptyTagRe.test( theirMatch[ 1 ] ) ) {
						theirMatch[ 1 ] = theirMatch[ 1 ].slice( 0, -1 );
						theirMatch[ 2 ] = '/' + theirMatch[ 2 ];
					}

					htmlList.push( [ theirMatch[ 1 ], ' ', myMatch[ 1 ] || '', theirMatch[ 2 ] ].join( '' ) );
				};
			} )(),

			
			fieldset: function( dialog, childObjList, childHtmlList, htmlList, elementDefinition ) {
				var legendLabel = elementDefinition.label;
				
				var innerHTML = function() {
						var html = [];
						legendLabel && html.push( '<legend' +
							( elementDefinition.labelStyle ? ' style="' + elementDefinition.labelStyle + '"' : '' ) +
							'>' + legendLabel + '</legend>' );
						for ( var i = 0; i < childHtmlList.length; i++ )
							html.push( childHtmlList[ i ] );
						return html.join( '' );
					};

				this._ = { children: childObjList };
				CKEDITOR.ui.dialog.uiElement.call( this, dialog, elementDefinition, htmlList, 'fieldset', null, null, innerHTML );
			}

		}, true );

		CKEDITOR.ui.dialog.html.prototype = new CKEDITOR.ui.dialog.uiElement();

		
		CKEDITOR.ui.dialog.labeledElement.prototype = CKEDITOR.tools.extend( new CKEDITOR.ui.dialog.uiElement(), {
			
			setLabel: function( label ) {
				var node = CKEDITOR.document.getById( this._.labelId );
				if ( node.getChildCount() < 1 )
				( new CKEDITOR.dom.text( label, CKEDITOR.document ) ).appendTo( node );
				else
					node.getChild( 0 ).$.nodeValue = label;
				return this;
			},

			
			getLabel: function() {
				var node = CKEDITOR.document.getById( this._.labelId );
				if ( !node || node.getChildCount() < 1 )
					return '';
				else
					return node.getChild( 0 ).getText();
			},

			
			eventProcessors: commonEventProcessors
		}, true );

		
		CKEDITOR.ui.dialog.button.prototype = CKEDITOR.tools.extend( new CKEDITOR.ui.dialog.uiElement(), {
			
			click: function() {
				if ( !this._.disabled )
					return this.fire( 'click', { dialog: this._.dialog } );
				return false;
			},

			
			enable: function() {
				this._.disabled = false;
				var element = this.getElement();
				element && element.removeClass( 'cke_disabled' );
			},

			
			disable: function() {
				this._.disabled = true;
				this.getElement().addClass( 'cke_disabled' );
			},

			
			isVisible: function() {
				return this.getElement().getFirst().isVisible();
			},

			
			isEnabled: function() {
				return !this._.disabled;
			},

			
			eventProcessors: CKEDITOR.tools.extend( {}, CKEDITOR.ui.dialog.uiElement.prototype.eventProcessors, {
				onClick: function( dialog, func ) {
					this.on( 'click', function() {
						func.apply( this, arguments );
					} );
				}
			}, true ),

			
			accessKeyUp: function() {
				this.click();
			},

			
			accessKeyDown: function() {
				this.focus();
			},

			keyboardFocusable: true
		}, true );

		
		CKEDITOR.ui.dialog.textInput.prototype = CKEDITOR.tools.extend( new CKEDITOR.ui.dialog.labeledElement(), {
			
			getInputElement: function() {
				return CKEDITOR.document.getById( this._.inputId );
			},

			
			focus: function() {
				var me = this.selectParentTab();

				// GECKO BUG: setTimeout() is needed to workaround invisible selections.
				setTimeout( function() {
					var element = me.getInputElement();
					element && element.$.focus();
				}, 0 );
			},

			
			select: function() {
				var me = this.selectParentTab();

				// GECKO BUG: setTimeout() is needed to workaround invisible selections.
				setTimeout( function() {
					var e = me.getInputElement();
					if ( e ) {
						e.$.focus();
						e.$.select();
					}
				}, 0 );
			},

			
			accessKeyUp: function() {
				this.select();
			},

			
			setValue: function( value ) {
				if ( this.bidi ) {
					var marker = value && value.charAt( 0 ),
						dir = ( marker == '\u202A' ? 'ltr' : marker == '\u202B' ? 'rtl' : null );

					if ( dir ) {
						value = value.slice( 1 );
					}

					// Set the marker or reset it (if dir==null).
					this.setDirectionMarker( dir );
				}

				if ( !value ) {
					value = '';
				}

				return CKEDITOR.ui.dialog.uiElement.prototype.setValue.apply( this, arguments );
			},

			
			getValue: function() {
				var value = CKEDITOR.ui.dialog.uiElement.prototype.getValue.call( this );

				if ( this.bidi && value ) {
					var dir = this.getDirectionMarker();
					if ( dir ) {
						value = ( dir == 'ltr' ? '\u202A' : '\u202B' ) + value;
					}
				}

				return value;
			},

			
			setDirectionMarker: function( dir ) {
				var inputElement = this.getInputElement();

				if ( dir ) {
					inputElement.setAttributes( {
						dir: dir,
						'data-cke-dir-marker': dir
					} );
				// Don't remove the dir attribute if this field hasn't got the marker,
				// because the dir attribute could be set independently.
				} else if ( this.getDirectionMarker() ) {
					inputElement.removeAttributes( [ 'dir', 'data-cke-dir-marker' ] );
				}
			},

			
			getDirectionMarker: function() {
				return this.getInputElement().data( 'cke-dir-marker' );
			},

			keyboardFocusable: true
		}, commonPrototype, true );

		CKEDITOR.ui.dialog.textarea.prototype = new CKEDITOR.ui.dialog.textInput();

		
		CKEDITOR.ui.dialog.select.prototype = CKEDITOR.tools.extend( new CKEDITOR.ui.dialog.labeledElement(), {
			
			getInputElement: function() {
				return this._.select.getElement();
			},

			
			add: function( label, value, index ) {
				var option = new CKEDITOR.dom.element( 'option', this.getDialog().getParentEditor().document ),
					selectElement = this.getInputElement().$;
				option.$.text = label;
				option.$.value = ( value === undefined || value === null ) ? label : value;
				if ( index === undefined || index === null ) {
					if ( CKEDITOR.env.ie ) {
						selectElement.add( option.$ );
					} else {
						selectElement.add( option.$, null );
					}
				} else {
					selectElement.add( option.$, index );
				}
				return this;
			},

			
			remove: function( index ) {
				var selectElement = this.getInputElement().$;
				selectElement.remove( index );
				return this;
			},

			
			clear: function() {
				var selectElement = this.getInputElement().$;
				while ( selectElement.length > 0 )
					selectElement.remove( 0 );
				return this;
			},

			keyboardFocusable: true
		}, commonPrototype, true );

		
		CKEDITOR.ui.dialog.checkbox.prototype = CKEDITOR.tools.extend( new CKEDITOR.ui.dialog.uiElement(), {
			
			getInputElement: function() {
				return this._.checkbox.getElement();
			},

			
			setValue: function( checked, noChangeEvent ) {
				this.getInputElement().$.checked = checked;
				!noChangeEvent && this.fire( 'change', { value: checked } );
			},

			
			getValue: function() {
				return this.getInputElement().$.checked;
			},

			
			accessKeyUp: function() {
				this.setValue( !this.getValue() );
			},

			
			eventProcessors: {
				onChange: function( dialog, func ) {
					if ( !CKEDITOR.env.ie || ( CKEDITOR.env.version > 8 ) )
						return commonEventProcessors.onChange.apply( this, arguments );
					else {
						dialog.on( 'load', function() {
							var element = this._.checkbox.getElement();
							element.on( 'propertychange', function( evt ) {
								evt = evt.data.$;
								if ( evt.propertyName == 'checked' )
									this.fire( 'change', { value: element.$.checked } );
							}, this );
						}, this );
						this.on( 'change', func );
					}
					return null;
				}
			},

			keyboardFocusable: true
		}, commonPrototype, true );

		
		CKEDITOR.ui.dialog.radio.prototype = CKEDITOR.tools.extend( new CKEDITOR.ui.dialog.uiElement(), {
			
			setValue: function( value, noChangeEvent ) {
				var children = this._.children,
					item;
				for ( var i = 0;
				( i < children.length ) && ( item = children[ i ] ); i++ )
					item.getElement().$.checked = ( item.getValue() == value );
				!noChangeEvent && this.fire( 'change', { value: value } );
			},

			
			getValue: function() {
				var children = this._.children;
				for ( var i = 0; i < children.length; i++ ) {
					if ( children[ i ].getElement().$.checked )
						return children[ i ].getValue();
				}
				return null;
			},

			
			accessKeyUp: function() {
				var children = this._.children,
					i;
				for ( i = 0; i < children.length; i++ ) {
					if ( children[ i ].getElement().$.checked ) {
						children[ i ].getElement().focus();
						return;
					}
				}
				children[ 0 ].getElement().focus();
			},

			
			eventProcessors: {
				onChange: function( dialog, func ) {
					if ( !CKEDITOR.env.ie || ( CKEDITOR.env.version > 8 ) )
						return commonEventProcessors.onChange.apply( this, arguments );
					else {
						dialog.on( 'load', function() {
							var children = this._.children,
								me = this;
							for ( var i = 0; i < children.length; i++ ) {
								var element = children[ i ].getElement();
								element.on( 'propertychange', function( evt ) {
									evt = evt.data.$;
									if ( evt.propertyName == 'checked' && this.$.checked )
										me.fire( 'change', { value: this.getAttribute( 'value' ) } );
								} );
							}
						}, this );
						this.on( 'change', func );
					}
					return null;
				}
			}
		}, commonPrototype, true );

		
		CKEDITOR.ui.dialog.file.prototype = CKEDITOR.tools.extend( new CKEDITOR.ui.dialog.labeledElement(), commonPrototype, {
			
			getInputElement: function() {
				var frameDocument = CKEDITOR.document.getById( this._.frameId ).getFrameDocument();
				return frameDocument.$.forms.length > 0 ? new CKEDITOR.dom.element( frameDocument.$.forms[ 0 ].elements[ 0 ] ) : this.getElement();
			},

			
			submit: function() {
				this.getInputElement().getParent().$.submit();
				return this;
			},

			
			getAction: function() {
				return this.getInputElement().getParent().$.action;
			},

			
			registerEvents: function( definition ) {
				var regex = /^on([A-Z]\w+)/,
					match;

				var registerDomEvent = function( uiElement, dialog, eventName, func ) {
						uiElement.on( 'formLoaded', function() {
							uiElement.getInputElement().on( eventName, func, uiElement );
						} );
					};

				for ( var i in definition ) {
					if ( !( match = i.match( regex ) ) )
						continue;

					if ( this.eventProcessors[ i ] )
						this.eventProcessors[ i ].call( this, this._.dialog, definition[ i ] );
					else
						registerDomEvent( this, this._.dialog, match[ 1 ].toLowerCase(), definition[ i ] );
				}

				return this;
			},

			
			reset: function() {
				var _ = this._,
					frameElement = CKEDITOR.document.getById( _.frameId ),
					frameDocument = frameElement.getFrameDocument(),
					elementDefinition = _.definition,
					buttons = _.buttons,
					callNumber = this.formLoadedNumber,
					unloadNumber = this.formUnloadNumber,
					langDir = _.dialog._.editor.lang.dir,
					langCode = _.dialog._.editor.langCode;

				// The callback function for the iframe, but we must call tools.addFunction only once
				// so we store the function number in this.formLoadedNumber
				if ( !callNumber ) {
					callNumber = this.formLoadedNumber = CKEDITOR.tools.addFunction( function() {
						// Now we can apply the events to the input type=file
						this.fire( 'formLoaded' );
					}, this );

					// Remove listeners attached to the content of the iframe (the file input)
					unloadNumber = this.formUnloadNumber = CKEDITOR.tools.addFunction( function() {
						this.getInputElement().clearCustomData();
					}, this );

					this.getDialog()._.editor.on( 'destroy', function() {
						CKEDITOR.tools.removeFunction( callNumber );
						CKEDITOR.tools.removeFunction( unloadNumber );
					} );
				}

				function generateFormField() {
					frameDocument.$.open();

					var size = '';
					if ( elementDefinition.size )
						size = elementDefinition.size - ( CKEDITOR.env.ie ? 7 : 0 ); // "Browse" button is bigger in IE.

					var inputId = _.frameId + '_input';

					frameDocument.$.write( [
						'<html dir="' + langDir + '" lang="' + langCode + '"><head><title></title></head><body style="margin: 0; overflow: hidden; background: transparent;">',
							'<form enctype="multipart/form-data" method="POST" dir="' + langDir + '" lang="' + langCode + '" action="',
								CKEDITOR.tools.htmlEncode( elementDefinition.action ),
							'">',
								// Replicate the field label inside of iframe.
								'<label id="', _.labelId, '" for="', inputId, '" style="display:none">',
									CKEDITOR.tools.htmlEncode( elementDefinition.label ),
								'</label>',
								// Set width to make sure that input is not clipped by the iframe (#11253).
								'<input style="width:100%" id="', inputId, '" aria-labelledby="', _.labelId, '" type="file" name="',
									CKEDITOR.tools.htmlEncode( elementDefinition.id || 'cke_upload' ),
									'" size="',
									CKEDITOR.tools.htmlEncode( size > 0 ? size : '' ),
								'" />',
							'</form>',
						'</body></html>',
						'<script>',
							// Support for custom document.domain in IE.
							CKEDITOR.env.ie ? '(' + CKEDITOR.tools.fixDomain + ')();' : '',

							'window.parent.CKEDITOR.tools.callFunction(' + callNumber + ');',
							'window.onbeforeunload = function() {window.parent.CKEDITOR.tools.callFunction(' + unloadNumber + ')}',
						'</script>'
					].join( '' ) );

					frameDocument.$.close();

					for ( var i = 0; i < buttons.length; i++ )
						buttons[ i ].enable();
				}

				// #3465: Wait for the browser to finish rendering the dialog first.
				if ( CKEDITOR.env.gecko )
					setTimeout( generateFormField, 500 );
				else
					generateFormField();
			},

			getValue: function() {
				return this.getInputElement().$.value || '';
			},

			
			setInitValue: function() {
				this._.initValue = '';
			},

			
			eventProcessors: {
				onChange: function( dialog, func ) {
					// If this method is called several times (I'm not sure about how this can happen but the default
					// onChange processor includes this protection)
					// In order to reapply to the new element, the property is deleted at the beggining of the registerEvents method
					if ( !this._.domOnChangeRegistered ) {
						// By listening for the formLoaded event, this handler will get reapplied when a new
						// form is created
						this.on( 'formLoaded', function() {
							this.getInputElement().on( 'change', function() {
								this.fire( 'change', { value: this.getValue() } );
							}, this );
						}, this );
						this._.domOnChangeRegistered = true;
					}

					this.on( 'change', func );
				}
			},

			keyboardFocusable: true
		}, true );

		CKEDITOR.ui.dialog.fileButton.prototype = new CKEDITOR.ui.dialog.button();

		CKEDITOR.ui.dialog.fieldset.prototype = CKEDITOR.tools.clone( CKEDITOR.ui.dialog.hbox.prototype );

		CKEDITOR.dialog.addUIElement( 'text', textBuilder );
		CKEDITOR.dialog.addUIElement( 'password', textBuilder );
		CKEDITOR.dialog.addUIElement( 'textarea', commonBuilder );
		CKEDITOR.dialog.addUIElement( 'checkbox', commonBuilder );
		CKEDITOR.dialog.addUIElement( 'radio', commonBuilder );
		CKEDITOR.dialog.addUIElement( 'button', commonBuilder );
		CKEDITOR.dialog.addUIElement( 'select', commonBuilder );
		CKEDITOR.dialog.addUIElement( 'file', commonBuilder );
		CKEDITOR.dialog.addUIElement( 'fileButton', commonBuilder );
		CKEDITOR.dialog.addUIElement( 'html', commonBuilder );
		CKEDITOR.dialog.addUIElement( 'fieldset', containerBuilder );
	}
} );




