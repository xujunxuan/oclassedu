define([
    'app'
    , 'text!modules/library/templates/signup.html'
],function(
    app
    , template
    ){
    'use strict';
    var View = Backbone.View.extend({
        title: '注册'
        , template: _.template(template)
        , events: {
            'click :submit': 'submit'
        }
        , initialize: function(){
        }
        , render: function(){
            this.$el.html(this.template());
            return this;
        }
        , submit: function(e){
            e.preventDefault();
            var form = this.$('form'),
                btn = form.find(':submit');
            btn.button('loading');
            $.post(form.attr('action'), form.serialize(), function(json){
                btn.button('reset');
                if(json.code == 0){
                    location.href = '#!/signin/';
                }else{
                    alert(json.msg);
                }
            }, 'json');
        }
    });
    return View;
});