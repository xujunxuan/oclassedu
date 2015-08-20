define([
    'app'
    , 'text!modules/library/templates/library.html'
],function(
    app
    , template
    ){
    'use strict';
    var View = Backbone.View.extend({
        title: '首页'
        , template: _.template(template)
        , events: {
            'click .more-btn a': 'toggleMore',
            'click #re_navbar li':'tagme'
        }
        , initialize: function(){
        }
        , render: function(){
            this.$el.html(this.template(this.model.toJSON()));
            $('#image-slider').flexslider({
                animation: "fade",
                //smoothHeight: true,
                //manualControlEvent:"hover"
            });
            
            $('.re_sh').addClass('hide');
            $('#re_shower li:first-child').removeClass('hide');
            return this;
        }
        , toggleMore: function(e){
            var $this = $(e.currentTarget),
                $more = $this.closest('.more-btn').siblings('.resource-more');
            if($more.css('display') == 'none'){
                $more.show();
                $this.html('隐藏更多 <i class="icon icon-arrow-circle-up"></i>');
            }else{
                $more.hide();
                $this.html('查看更多 <i class="icon icon-arrow-circle-down"></i>');
            }
        }
        ,tagme:function(e){
            
            var temp=$('.re_sh');
            for (var i = 0; i <= temp.length; i++) {
                /*if(temp[i].hasClass('hide'))
                {
                    temp[i].removeAttr('class','hide');
                }*/
                if(!($('.re_sh').eq(i).hasClass('hide')))
                {
                    $('.re_sh').eq(i).addClass('hide');
                }
            };
            var $trg_obj=$(e.currentTarget);
            var trg=$trg_obj.attr('ctr_id');
            $('.re_sh').eq(trg).removeClass('hide');       
        }
    });
    return View;
});